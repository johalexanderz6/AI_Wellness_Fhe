# AI Wellness FHE: Your AI-Powered Mental Wellness Companion

The AI Wellness FHE project is a cutting-edge solution that harnesses **Zama's Fully Homomorphic Encryption technology** to provide personalized mental wellness support. This innovative AI mental health partner allows users to safely share their encrypted diaries and thoughts, enabling a secure and private space for emotional analysis and support.

## Understanding the Problem

Mental health is a crucial aspect of overall well-being, yet many people struggle to find the right resources or feel comfortable discussing their feelings. Traditional mental health solutions often require individuals to share sensitive information openly, which can deter them from seeking help. Privacy concerns, stigma, and the overwhelming nature of opening up about personal struggles can prevent individuals from accessing the support they need.

## How FHE Provides a Solution

The AI Wellness FHE addresses these challenges by employing **Fully Homomorphic Encryption (FHE)**, a technology that allows computations to be performed on encrypted data. This ensures that users’ personal data remains confidential while enabling the AI to analyze emotions and provide tailored advice based on the encrypted input. By utilizing Zama's open-source libraries, such as the **Concrete** and **TFHE-rs**, this project elevates mental health technology, creating a safe and judgment-free environment for users.

## Core Features

- **User Data Encryption**: All personal psychological data shared by users is encrypted using FHE, ensuring maximum privacy.
- **AI Emotion Analysis**: The AI conducts emotion analysis on the encrypted data, enabling insights without compromising user confidentiality.
- **Personalized Support**: Users receive customized and private mental wellness advice based on their unique feelings and experiences.
- **Secure Interaction Space**: The platform offers an entirely safe, non-judgmental environment where individuals can express themselves freely.
- **Conversational Interface**: A user-friendly dialogue interface combined with emotion tracking for engaging interactions.

## Technology Stack

- **Zama FHE SDK**: Core library for performing computations on encrypted data.
- **Node.js**: JavaScript runtime built on Chrome's V8 JavaScript engine.
- **Hardhat/Foundry**: Development environments for Ethereum smart contracts.
- **Express.js**: Web application framework for Node.js.

## Directory Structure

```plaintext
AI_Wellness_Fhe/
├── contracts/
│   └── AI_Wellness_FHE.sol
├── src/
│   ├── ai/
│   │   └── emotion_analysis.js
│   ├── config/
│   │   └── settings.js
│   └── index.js
├── tests/
│   └── ai_tests.js
└── package.json
```

## Installation Guide

Follow these instructions to set up the AI Wellness FHE project:

1. Ensure you have Node.js installed on your machine.
2. Install Hardhat or Foundry for smart contract development.
3. Navigate to the project directory and run the following command:

   ```bash
   npm install
   ```

This command will install all required dependencies, including the necessary Zama FHE libraries.

> **Important:** Please refrain from using `git clone` or any URL-based installation commands.

## Build & Run Guide

After installing the necessary dependencies, you can compile and run the project using the following commands:

1. To compile the smart contracts, execute:

   ```bash
   npx hardhat compile
   ```

2. Next, to run the tests and ensure everything is functioning as expected, use:

   ```bash
   npx hardhat test
   ```

3. Finally, to launch the application, run:

   ```bash
   node src/index.js
   ```

## Example Code Snippet

Here’s a code snippet to illustrate how the AI processes encrypted user data for emotion analysis:

```javascript
const { encryptData, analyzeEmotions } = require('./ai/emotion_analysis');

const userInput = "I feel anxious about my job.";
const encryptedData = encryptData(userInput);

const personalizedAdvice = analyzeEmotions(encryptedData);
console.log(`Your AI Companion says: ${personalizedAdvice}`);
```

In this example, user input is encrypted for privacy and subsequently analyzed to generate personalized emotional advice.

## Acknowledgements

### Powered by Zama

A special thanks to the Zama team for their pioneering efforts and open-source tools that make confidential blockchain applications possible. Your commitment to advancing privacy-preserving technologies empowers projects like AI Wellness FHE to thrive in the mental health sector. Together, we’re breaking barriers and paving the way for a more secure and supportive future.