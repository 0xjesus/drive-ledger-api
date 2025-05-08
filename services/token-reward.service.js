import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import {
	createApproveInstruction,
	createAssociatedTokenAccountInstruction,
	createBurnInstruction,
	createInitializeMintInstruction,
	createMintToInstruction,
	createTransferInstruction,
	getAssociatedTokenAddress,
	getMint,
	MINT_SIZE,
	TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

// Usar Solana Devnet para pruebas
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

class TokenRewardService {
	static tokenMintAddress = "2CdXTtCLWNMfG7EvuMfuQ7FNEjrneUxscg3VgpqQzgAD";
	static tokenSymbol = "DRVL"; // AutoNexus Token
	static tokenDecimals = 6;

	static async finalizeTransaction(transaction, payer) {
		const { blockhash } = await connection.getRecentBlockhash();
		transaction.recentBlockhash = blockhash;
		transaction.feePayer = new PublicKey(payer);
		const serializedTransaction = transaction.serialize({ requireAllSignatures: false });
		return serializedTransaction.toString('base64');
	}

	// Inicializa el servicio con la dirección del token existente o crea uno nuevo
	static async initialize(payer, existingTokenMint = null) {
		try {
			if(existingTokenMint) {
				TokenRewardService.tokenMintAddress = existingTokenMint;
				console.log(`Using existing token: ${ TokenRewardService.tokenMintAddress }`);

				// Obtener la información del token para conocer sus decimales
				const mintInfo = await getMint(connection, new PublicKey(existingTokenMint));
				TokenRewardService.tokenDecimals = mintInfo.decimals;

				return { tokenMintAddress: existingTokenMint };
			} else {
				// Crear un nuevo token
				console.log('Creating new AutoNexus token...');
				const {
					encodedTransaction,
					mintPublicKey,
				} = await this.createToken(payer, TokenRewardService.tokenDecimals);
				TokenRewardService.tokenMintAddress = mintPublicKey;
				return {
					encodedTransaction,
					tokenMintAddress: mintPublicKey,
					message: 'New AutoNexus token created. Please sign and submit the transaction.',
				};
			}
		} catch(error) {
			console.error('Error initializing token service:', error);
			throw error;
		}
	}

	static async createToken(payer, decimals) {
		try {
			const transaction = new Transaction();
			const mintKeypair = Keypair.generate();
			const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

			const createAccountTx = SystemProgram.createAccount({
				fromPubkey: new PublicKey(payer),
				newAccountPubkey: mintKeypair.publicKey,
				lamports,
				space: MINT_SIZE,
				programId: TOKEN_PROGRAM_ID,
			});
			transaction.add(createAccountTx);

			const mintInstruction = createInitializeMintInstruction(
				mintKeypair.publicKey,
				decimals,
				new PublicKey(payer),
				new PublicKey(payer),
				TOKEN_PROGRAM_ID,
			);
			transaction.add(mintInstruction);

			// Obtener recentBlockhash ANTES de firmar
			const { blockhash } = await connection.getRecentBlockhash();
			transaction.recentBlockhash = blockhash;
			transaction.feePayer = new PublicKey(payer);

			// Ahora firmamos después de tener el blockhash
			transaction.partialSign(mintKeypair);

			const encodedTransaction = await this.finalizeTransaction(transaction, payer);
			return { encodedTransaction, mintPublicKey: mintKeypair.publicKey.toString() };
		} catch(error) {
			console.error('Error creating token:', error);
			throw error;
		}
	}

	static async rewardUser(payer, userAddress, rewardAmount) {
		try {
			if(!TokenRewardService.tokenMintAddress) {
				throw new Error('Token mint address not initialized. Call initialize() first.');
			}

			// Mint tokens to user's wallet as reward
			const encodedTransaction = await this.mintToken(
				payer,
				TokenRewardService.tokenMintAddress,
				userAddress,
				rewardAmount,
			);

			return {
				encodedTransaction,
				message: `Reward of ${ rewardAmount } ${ TokenRewardService.tokenSymbol } tokens prepared for ${ userAddress }. Please sign the transaction.`,
			};
		} catch(error) {
			console.error('Error rewarding user:', error);
			throw error;
		}
	}

	static async mintToken(payer, mintAddress, recipientAddress, amount) {
		try {
			const transaction = new Transaction();
			const payerPublicKey = new PublicKey(payer);
			const mintPublicKey = new PublicKey(mintAddress);
			const recipientPublicKey = new PublicKey(recipientAddress);
			const recipientTokenAddress = await getAssociatedTokenAddress(mintPublicKey, recipientPublicKey);

			// Fetch the mint information to get the number of decimals
			const mintInfo = await getMint(connection, mintPublicKey);
			const decimals = mintInfo.decimals;

			// Convert the amount to the correct decimal format
			const adjustedAmount = amount * Math.pow(10, decimals);

			const recipientTokenAccountInfo = await connection.getAccountInfo(recipientTokenAddress);
			if(!recipientTokenAccountInfo) {
				const createRecipientTokenAccountInstruction = createAssociatedTokenAccountInstruction(
					payerPublicKey,
					recipientTokenAddress,
					recipientPublicKey,
					mintPublicKey,
				);
				transaction.add(createRecipientTokenAccountInstruction);
			}

			const mintToInstruction = createMintToInstruction(
				mintPublicKey,
				recipientTokenAddress,
				payerPublicKey,
				adjustedAmount,
				[],
			);
			transaction.add(mintToInstruction);
			return await this.finalizeTransaction(transaction, payer);
		} catch(error) {
			console.error('Error minting token:', error);
			throw error;
		}
	}

	static async transferToken(payer, fromAddress, toAddress, mintAddress, amount) {
		try {
			const transaction = new Transaction();
			const fromPublicKey = new PublicKey(fromAddress);
			const toPublicKey = new PublicKey(toAddress);
			const mintPublicKey = new PublicKey(mintAddress);
			const payerPublicKey = new PublicKey(payer);

			const mintInfo = await getMint(connection, mintPublicKey);
			const decimals = mintInfo.decimals;

			const fromTokenAddress = await getAssociatedTokenAddress(mintPublicKey, fromPublicKey);
			const toTokenAddress = await getAssociatedTokenAddress(mintPublicKey, toPublicKey);

			const adjustedAmount = amount * Math.pow(10, decimals);

			const toTokenAccountInfo = await connection.getAccountInfo(toTokenAddress);
			if(!toTokenAccountInfo) {
				const createToTokenAccountInstruction = createAssociatedTokenAccountInstruction(
					payerPublicKey,
					toTokenAddress,
					toPublicKey,
					mintPublicKey,
				);
				transaction.add(createToTokenAccountInstruction);
			}

			const transferInstruction = createTransferInstruction(
				fromTokenAddress,
				toTokenAddress,
				payerPublicKey,
				adjustedAmount,
				[],
			);
			transaction.add(transferInstruction);

			return await this.finalizeTransaction(transaction, payer);
		} catch(error) {
			console.error('Error transferring token:', error);
			throw error;
		}
	}

	static async delegateToken(payer, ownerAddress, delegateAddress, mintAddress, amount) {
		try {
			const transaction = new Transaction();
			const ownerPublicKey = new PublicKey(ownerAddress);
			const delegatePublicKey = new PublicKey(delegateAddress);
			const mintPublicKey = new PublicKey(mintAddress);
			const payerPublicKey = new PublicKey(payer);

			const mintInfo = await getMint(connection, mintPublicKey);
			const decimals = mintInfo.decimals;

			const adjustedAmount = amount * Math.pow(10, decimals);
			const tokenAccount = await getAssociatedTokenAddress(mintPublicKey, ownerPublicKey);

			const tokenAccountInfo = await connection.getAccountInfo(tokenAccount);
			if(!tokenAccountInfo) {
				const createTokenAccountInstruction = createAssociatedTokenAccountInstruction(
					payerPublicKey,
					tokenAccount,
					ownerPublicKey,
					mintPublicKey,
				);
				transaction.add(createTokenAccountInstruction);
			}

			const approveInstruction = createApproveInstruction(
				tokenAccount,
				delegatePublicKey,
				ownerPublicKey,
				adjustedAmount,
				[],
			);
			transaction.add(approveInstruction);

			return await this.finalizeTransaction(transaction, payer);
		} catch(error) {
			console.error('Error delegating token:', error);
			throw error;
		}
	}

	static async getTokenBalance(walletAddress, mintAddress = null) {
		try {
			const mintPublicKey = new PublicKey(mintAddress || TokenRewardService.tokenMintAddress);
			if(!mintPublicKey) {
				throw new Error('Token mint address not provided or initialized');
			}

			const walletPublicKey = new PublicKey(walletAddress);
			const tokenAddress = await getAssociatedTokenAddress(mintPublicKey, walletPublicKey);

			try {
				const balance = await connection.getTokenAccountBalance(tokenAddress);
				const mintInfo = await getMint(connection, mintPublicKey);

				return {
					balance: parseFloat(balance.value.amount) / Math.pow(10, mintInfo.decimals),
					decimals: mintInfo.decimals,
					uiBalance: balance.value.uiAmount,
					symbol: TokenRewardService.tokenSymbol,
				};
			} catch(error) {
				// Si no encuentra la cuenta, probablemente significa que el usuario no tiene tokens
				if(error.message.includes('failed to find account')) {
					return {
						balance: 0,
						decimals: TokenRewardService.tokenDecimals,
						uiBalance: 0,
						symbol: TokenRewardService.tokenSymbol,
					};
				}
				throw error;
			}
		} catch(error) {
			console.error('Error getting token balance:', error);
			throw error;
		}
	}
}

export default TokenRewardService;
