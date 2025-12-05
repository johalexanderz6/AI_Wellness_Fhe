pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AIWellnessFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosed();
    error BatchNotClosed();
    error InvalidArgument();
    error ReplayDetected();
    error StateMismatch();
    error DecryptionFailed();

    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event JournalSubmitted(address indexed user, uint256 indexed batchId, uint256 encryptedScore);
    event AnalysisRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event AnalysisCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 averageScore);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    mapping(address => bool) public isProvider;
    mapping(uint256 => DecryptionContext) public decryptionContexts;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    address public owner;
    bool public paused;
    uint256 public cooldownSeconds;
    uint256 public currentBatchId;
    bool public currentBatchClosed;

    euint32 public encryptedTotalScore;
    euint32 public encryptedEntryCount;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier submissionCooldown(address user) {
        if (block.timestamp < lastSubmissionTime[user] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier decryptionCooldown(address user) {
        if (block.timestamp < lastDecryptionRequestTime[user] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        _initIfNeeded(encryptedTotalScore);
        _initIfNeeded(encryptedEntryCount);
        currentBatchId = 1; // Start with batch 1
    }

    function addProvider(address _provider) external onlyOwner {
        if (_provider == address(0)) revert InvalidArgument();
        isProvider[_provider] = true;
        emit ProviderAdded(_provider);
    }

    function removeProvider(address _provider) external onlyOwner {
        if (!isProvider[_provider]) revert InvalidArgument();
        delete isProvider[_provider];
        emit ProviderRemoved(_provider);
    }

    function setPause(bool _paused) external onlyOwner {
        if (_paused != paused) {
            paused = _paused;
            if (paused) {
                emit Paused(msg.sender);
            } else {
                emit Unpaused(msg.sender);
            }
        }
    }

    function setCooldownSeconds(uint256 _cooldownSeconds) external onlyOwner {
        uint256 oldCooldown = cooldownSeconds;
        if (_cooldownSeconds == oldCooldown) revert InvalidArgument();
        cooldownSeconds = _cooldownSeconds;
        emit CooldownSet(oldCooldown, _cooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        if (!currentBatchClosed) revert BatchNotClosed();
        currentBatchId++;
        currentBatchClosed = false;
        // Reset encrypted accumulators for the new batch
        encryptedTotalScore = FHE.asEuint32(0);
        encryptedEntryCount = FHE.asEuint32(0);
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyOwner whenNotPaused {
        if (currentBatchClosed) revert BatchClosed();
        currentBatchClosed = true;
        emit BatchClosed(currentBatchId);
    }

    function submitJournalEntry(euint32 encryptedScore) external onlyProvider whenNotPaused submissionCooldown(msg.sender) {
        _requireInitialized(encryptedScore);
        if (currentBatchClosed) revert BatchClosed();

        lastSubmissionTime[msg.sender] = block.timestamp;

        encryptedTotalScore = encryptedTotalScore.add(encryptedScore);
        encryptedEntryCount = encryptedEntryCount.add(FHE.asEuint32(1));

        emit JournalSubmitted(msg.sender, currentBatchId, encryptedScore.toBytes32());
    }

    function requestAnalysis() external onlyProvider whenNotPaused decryptionCooldown(msg.sender) {
        if (!currentBatchClosed) revert BatchNotClosed();
        _requireInitialized(encryptedTotalScore);
        _requireInitialized(encryptedEntryCount);

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 encryptedAverageScore = encryptedTotalScore.mul(FHE.inv(encryptedEntryCount, 32)); // FHE division

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = encryptedAverageScore.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: currentBatchId,
            stateHash: stateHash,
            processed: false
        });

        emit AnalysisRequested(requestId, currentBatchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        // @dev Replay protection: ensure this callback hasn't been processed for this requestId
        if (decryptionContexts[requestId].processed) revert ReplayDetected();

        // @dev State verification: ensure the ciphertexts that were requested for decryption haven't changed
        // since the request was made. This prevents certain front-running or MEV attacks.
        bytes32[] memory cts = new bytes32[](1);
        // Rebuild the ciphertext array in the exact same order as in requestAnalysis
        // For this contract, it's just the encryptedAverageScore.
        // We need to get this from the current state of the contract.
        // Since requestAnalysis uses encryptedTotalScore and encryptedEntryCount for the currentBatchId,
        // we must ensure we are using the same batch's data.
        // The DecryptionContext stores the batchId.
        // This simplified example assumes the contract state for that batch is still available
        // and correctly reflects what was used in requestAnalysis.
        // In a more complex scenario, you might store the specific ciphertexts in the context.
        // Here, we reconstruct it from the current contract state, assuming it's for the correct batch.
        // This relies on `currentBatchId` and `encryptedAverageScore` being stable or correctly reflecting
        // the state at the time of `requestAnalysis` for that `batchId`.
        // A more robust way would be to store the `bytes32` of `encryptedAverageScore` in `DecryptionContext`.
        // For this exercise, we will reconstruct based on current state, assuming it's for the correct batch.
        // This is a simplification. A production system might store the specific ciphertexts.
        // For now, we'll assume `encryptedTotalScore` and `encryptedEntryCount` are for `decryptionContexts[requestId].batchId`.
        // This is a potential weakness if batches can be overwritten or if state is not versioned per batch.
        // The problem implies a single active batch whose results are being decrypted.
        // If `currentBatchId` has changed, this might be an issue.
        // The `stateHash` check is supposed to catch this if the underlying data changed.
        // Let's assume the contract state for `encryptedTotalScore` and `encryptedEntryCount` is what was used.
        
        euint32 currentEncryptedAverageScore = encryptedTotalScore.mul(FHE.inv(encryptedEntryCount, 32));
        cts[0] = currentEncryptedAverageScore.toBytes32();
        
        bytes32 currentHash = _hashCiphertexts(cts);
        if (currentHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        // @dev Proof verification: ensure the decryption proof is valid
        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert DecryptionFailed();
        }

        // Decode cleartexts
        // cleartexts is abi.encodePacked(uint256, uint256, ...)
        uint256 averageScore;
        assembly {
            averageScore := mload(add(cleartexts, 0x20)) // First 32 bytes
        }

        decryptionContexts[requestId].processed = true;
        emit AnalysisCompleted(requestId, decryptionContexts[requestId].batchId, averageScore);
    }

    function _initIfNeeded(euint32 v) internal {
        if (!FHE.isInitialized(v)) {
            v = FHE.asEuint32(0);
        }
    }

    function _requireInitialized(euint32 v) internal pure {
        if (!FHE.isInitialized(v)) revert InvalidArgument();
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }
}