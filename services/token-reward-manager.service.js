// TokenRewardManager.js
import { Keypair, Connection, Transaction, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  createMintToInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getMint,
  createTransferInstruction
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class TokenRewardManager {
  // Configuración estática
  static SOLANA_NETWORK = 'devnet';
  static SOLANA_CONNECTION = new Connection(`https://api.${TokenRewardManager.SOLANA_NETWORK}.solana.com`, 'confirmed');
  static TOKEN_SYMBOL = 'DRVL';
  static TOKEN_DECIMALS = 6;
  static TOKEN_MINT_ADDRESS = null;

  /**
   * Carga el keypair de la wallet que tiene autoridad para acuñar tokens
   * @param {string} keypairPath - Ruta al archivo con la clave privada
   * @returns {Keypair} Keypair de Solana
   */
  static loadWalletKeypair(keypairPath = './wallet/devnet-wallet.json') {
    try {
      const secretKeyString = fs.readFileSync(path.resolve(keypairPath), 'utf8');
      const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
      return Keypair.fromSecretKey(secretKey);
    } catch (error) {
      console.error('Error loading wallet keypair:', error);
      throw new Error('Failed to load wallet keypair');
    }
  }

  /**
   * Inicializa el gestor de recompensas
   * @param {string} tokenMintAddress - Dirección del token
   * @returns {Object} Información del token inicializado
   */
  static async initialize(tokenMintAddress) {
    try {
      // Cargar información del token
      const mintPublicKey = new PublicKey(tokenMintAddress);
      const mintInfo = await getMint(TokenRewardManager.SOLANA_CONNECTION, mintPublicKey);

      TokenRewardManager.TOKEN_MINT_ADDRESS = tokenMintAddress;
      TokenRewardManager.TOKEN_DECIMALS = mintInfo.decimals;

      return {
        tokenMintAddress,
        tokenDecimals: mintInfo.decimals,
        mintAuthority: mintInfo.mintAuthority.toString(),
        supply: Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)
      };
    } catch (error) {
      console.error('Error initializing TokenRewardManager:', error);
      throw error;
    }
  }

  /**
   * Acuña tokens como recompensa y los envía directamente a la wallet del usuario
   * @param {string} recipientAddress - Dirección de la wallet que recibirá los tokens
   * @param {number} amount - Cantidad de tokens a acuñar
   * @param {string} simulationId - ID de la simulación asociada a la recompensa (opcional)
   * @param {string} keypairPath - Ruta al archivo con la clave privada de la autoridad de mint
   * @returns {Object} Información de la transacción
   */
  static async mintRewardTokens(recipientAddress, amount, simulationId = null, keypairPath = './wallet/devnet-wallet.json') {
    try {
      console.log(`Acuñando ${amount} ${TokenRewardManager.TOKEN_SYMBOL} para ${recipientAddress}...`);

      // Validar parámetros
      if (!TokenRewardManager.TOKEN_MINT_ADDRESS) {
        throw new Error('TokenRewardManager no inicializado. Llama a initialize() primero.');
      }

      if (!recipientAddress || !amount || amount <= 0) {
        throw new Error('Parámetros inválidos. Se requiere dirección de destinatario y cantidad positiva.');
      }

      // Buscar o crear usuario en la base de datos
      const user = await prisma.user.upsert({
        where: { walletAddress: recipientAddress },
        update: {},
        create: {
          walletAddress: recipientAddress
        }
      });

      // Crear registro de recompensa en la base de datos
      const reward = await prisma.reward.create({
        data: {
          userId: user.id,
          simulationId: simulationId,
          amount: amount,
          status: 'PENDING'
        }
      });

      // Cargar keypair de la autoridad de mint
      const mintAuthorityKeypair = TokenRewardManager.loadWalletKeypair(keypairPath);
      const mintAuthority = mintAuthorityKeypair.publicKey.toString();

      // Preparar para acuñar tokens
      const mintPublicKey = new PublicKey(TokenRewardManager.TOKEN_MINT_ADDRESS);
      const recipientPublicKey = new PublicKey(recipientAddress);

      // Obtener la dirección de la cuenta asociada de tokens del destinatario
      const recipientTokenAddress = await getAssociatedTokenAddress(mintPublicKey, recipientPublicKey);

      // Crear una nueva transacción
      const transaction = new Transaction();

      // Verificar si la cuenta asociada de tokens ya existe
      const recipientTokenAccountInfo = await TokenRewardManager.SOLANA_CONNECTION.getAccountInfo(recipientTokenAddress);

      // Si la cuenta no existe, añadir instrucción para crearla
      if (!recipientTokenAccountInfo) {
        console.log(`Cuenta de token no encontrada para ${recipientAddress}. Creando una nueva...`);

        const createATAInstruction = createAssociatedTokenAccountInstruction(
          mintAuthorityKeypair.publicKey,
          recipientTokenAddress,
          recipientPublicKey,
          mintPublicKey
        );

        transaction.add(createATAInstruction);
      }

      // Ajustar la cantidad según los decimales del token
      const adjustedAmount = Math.round(amount * Math.pow(10, TokenRewardManager.TOKEN_DECIMALS));

      // Crear instrucción para acuñar tokens
      const mintInstruction = createMintToInstruction(
        mintPublicKey,
        recipientTokenAddress,
        mintAuthorityKeypair.publicKey,
        adjustedAmount,
        []
      );

      transaction.add(mintInstruction);

      // Obtener un blockhash reciente
      const { blockhash } = await TokenRewardManager.SOLANA_CONNECTION.getRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = mintAuthorityKeypair.publicKey;

      // Serializar la transacción para frontend (sin firmar)
      const serializedTransaction = transaction.serialize({ requireAllSignatures: false }).toString('base64');

      // Actualizar registro de recompensa con la transacción
      await prisma.reward.update({
        where: { id: reward.id },
        data: {
          encodedTransaction: serializedTransaction,
          status: 'PROCESSING'
        }
      });

      // Firmar y enviar la transacción si estamos en un entorno de backend
      try {
        // Firmar la transacción
        transaction.sign(mintAuthorityKeypair);

        // Enviar la transacción firmada
        console.log('Enviando transacción a la blockchain...');
        const signature = await TokenRewardManager.SOLANA_CONNECTION.sendRawTransaction(
          transaction.serialize()
        );

        // Esperar confirmación
        console.log(`Esperando confirmación para la transacción ${signature}...`);
        const confirmation = await TokenRewardManager.SOLANA_CONNECTION.confirmTransaction(signature);

        console.log(`✅ Transacción confirmada! ${amount} ${TokenRewardManager.TOKEN_SYMBOL} acuñados para ${recipientAddress}`);

        // Actualizar registro de recompensa con el hash de la transacción
        await prisma.reward.update({
          where: { id: reward.id },
          data: {
            transactionHash: signature,
            status: 'COMPLETED'
          }
        });

        // Actualizar o crear balance de tokens
        await TokenRewardManager.updateTokenBalance(recipientAddress, amount);

        // Devolver información de la transacción
        return {
          success: true,
          signature,
          rewardId: reward.id,
          recipient: recipientAddress,
          amount,
          token: TokenRewardManager.TOKEN_MINT_ADDRESS,
          tokenSymbol: TokenRewardManager.TOKEN_SYMBOL,
          timestamp: new Date().toISOString(),
          txExplorer: `https://explorer.solana.com/tx/${signature}?cluster=${TokenRewardManager.SOLANA_NETWORK}`
        };
      } catch (txError) {
        console.error('Error sending transaction:', txError);

        // Actualizar estado de la recompensa a fallido
        await prisma.reward.update({
          where: { id: reward.id },
          data: {
            status: 'FAILED'
          }
        });

        // Devolver la transacción codificada para que el frontend la firme
        return {
          success: false,
          rewardId: reward.id,
          encodedTransaction: serializedTransaction,
          recipient: recipientAddress,
          amount,
          error: txError.message,
          requiresFrontendSigning: true
        };
      }
    } catch (error) {
      console.error('Error acuñando tokens:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Actualiza el balance de tokens en la base de datos
   * @param {string} walletAddress - Dirección de la wallet
   * @param {number} amountChange - Cantidad a añadir (o restar si es negativo)
   */
  static async updateTokenBalance(walletAddress, amountChange) {
    try {
      // Buscar el usuario
      const user = await prisma.user.findUnique({
        where: { walletAddress }
      });

      if (!user) {
        throw new Error(`User with wallet ${walletAddress} not found`);
      }

      // Buscar el balance actual
      const tokenBalance = await prisma.tokenBalance.findUnique({
        where: {
          userId_tokenMintAddress: {
            userId: user.id,
            tokenMintAddress: TokenRewardManager.TOKEN_MINT_ADDRESS
          }
        }
      });

      if (tokenBalance) {
        // Actualizar balance existente
        await prisma.tokenBalance.update({
          where: { id: tokenBalance.id },
          data: {
            balance: tokenBalance.balance + amountChange,
            lastUpdated: new Date()
          }
        });
      } else {
        // Crear nuevo balance
        await prisma.tokenBalance.create({
          data: {
            userId: user.id,
            tokenMintAddress: TokenRewardManager.TOKEN_MINT_ADDRESS,
            balance: amountChange,
            lastUpdated: new Date()
          }
        });
      }
    } catch (error) {
      console.error('Error updating token balance:', error);
      throw error;
    }
  }

  /**
   * Realiza un airdrop de tokens a una wallet (útil para testing)
   * Este método primero hace un airdrop de SOL si es necesario y luego envía tokens
   * @param {string} walletAddress - Dirección de la wallet que recibirá los tokens
   * @param {number} amount - Cantidad de tokens a enviar
   * @param {string} keypairPath - Ruta al archivo con la clave privada de la autoridad de mint
   * @returns {Object} Información de la transacción
   */
  static async airdropTokens(walletAddress, amount = 100, keypairPath = './wallet/devnet-wallet.json') {
    try {
      console.log(`Iniciando airdrop de ${amount} ${TokenRewardManager.TOKEN_SYMBOL} para ${walletAddress}...`);

      const userPublicKey = new PublicKey(walletAddress);

      // Buscar o crear usuario en la base de datos
      const user = await prisma.user.upsert({
        where: { walletAddress },
        update: {},
        create: { walletAddress }
      });

      // Crear registro de transacción en la base de datos
      const mintAuthorityKeypair = TokenRewardManager.loadWalletKeypair(keypairPath);

      // Crear usuario para la mint authority si no existe
      await prisma.user.upsert({
        where: { walletAddress: mintAuthorityKeypair.publicKey.toString() },
        update: {},
        create: { walletAddress: mintAuthorityKeypair.publicKey.toString() }
      });

      // Crear transacción en la base de datos
      const transaction = await prisma.transaction.create({
        data: {
          type: 'AIRDROP',
          senderId: user.id, // Usuario que recibe (se usa el mismo para mantener consistencia)
          receiverId: user.id,
          amount: amount,
          status: 'PENDING'
        }
      });

      // Verificar el balance de SOL del usuario
      const userSolBalance = await TokenRewardManager.SOLANA_CONNECTION.getBalance(userPublicKey);

      // Si el usuario tiene poco SOL, hacer un airdrop de SOL primero
      if (userSolBalance < 0.05 * LAMPORTS_PER_SOL) {
        console.log(`Balance de SOL bajo (${userSolBalance / LAMPORTS_PER_SOL} SOL). Realizando airdrop de SOL...`);

        try {
          // Solicitar 1 SOL del faucet de devnet
          const airdropSignature = await TokenRewardManager.SOLANA_CONNECTION.requestAirdrop(
            userPublicKey,
            1 * LAMPORTS_PER_SOL
          );

          // Esperar confirmación
          await TokenRewardManager.SOLANA_CONNECTION.confirmTransaction(airdropSignature);
          console.log(`✅ Airdrop de 1 SOL completado para ${walletAddress}`);
        } catch (solError) {
          console.warn(`⚠️ No se pudo realizar airdrop de SOL: ${solError.message}`);
          console.log('Continuando con el airdrop de tokens de todos modos...');
        }
      }

      // Acuñar tokens para el usuario
      const mintResult = await TokenRewardManager.mintRewardTokens(walletAddress, amount, null, keypairPath);

      // Actualizar la transacción con el resultado
      if (mintResult.success) {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'COMPLETED',
            blockchainTxHash: mintResult.signature,
            completedAt: new Date()
          }
        });

        return {
          ...mintResult,
          transactionId: transaction.id,
          message: `Airdrop de ${amount} ${TokenRewardManager.TOKEN_SYMBOL} completado para ${walletAddress}`
        };
      } else {
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: 'FAILED',
            encodedTransaction: mintResult.encodedTransaction
          }
        });

        return {
          success: false,
          transactionId: transaction.id,
          error: mintResult.error || 'Error en el airdrop',
          encodedTransaction: mintResult.encodedTransaction,
          requiresFrontendSigning: true
        };
      }
    } catch (error) {
      console.error('Error en airdrop de tokens:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Genera una transacción para transferir tokens entre usuarios
   * @param {string} fromAddress - Dirección de origen
   * @param {string} toAddress - Dirección de destino
   * @param {number} amount - Cantidad a transferir
   * @returns {string} Transacción serializada en base64
   */
  static async generateTransferTransaction(fromAddress, toAddress, amount) {
    try {
      if (!TokenRewardManager.TOKEN_MINT_ADDRESS) {
        throw new Error('TokenRewardManager no inicializado. Llama a initialize() primero.');
      }

      // Buscar o crear usuarios en la base de datos
      const sender = await prisma.user.upsert({
        where: { walletAddress: fromAddress },
        update: {},
        create: { walletAddress: fromAddress }
      });

      const receiver = await prisma.user.upsert({
        where: { walletAddress: toAddress },
        update: {},
        create: { walletAddress: toAddress }
      });

      // Crear transacción en la base de datos
      const dbTransaction = await prisma.transaction.create({
        data: {
          type: 'TRANSFER',
          senderId: sender.id,
          receiverId: receiver.id,
          amount: amount,
          status: 'PENDING'
        }
      });

      const fromPublicKey = new PublicKey(fromAddress);
      const toPublicKey = new PublicKey(toAddress);
      const mintPublicKey = new PublicKey(TokenRewardManager.TOKEN_MINT_ADDRESS);

      // Obtener las direcciones de las cuentas asociadas
      const fromTokenAddress = await getAssociatedTokenAddress(mintPublicKey, fromPublicKey);
      const toTokenAddress = await getAssociatedTokenAddress(mintPublicKey, toPublicKey);

      // Ajustar la cantidad según los decimales
      const adjustedAmount = Math.round(amount * Math.pow(10, TokenRewardManager.TOKEN_DECIMALS));

      // Crear transacción
      const transaction = new Transaction();

      // Verificar si la cuenta del destinatario existe
      const toTokenAccountInfo = await TokenRewardManager.SOLANA_CONNECTION.getAccountInfo(toTokenAddress);

      // Si la cuenta no existe, añadir instrucción para crearla
      if (!toTokenAccountInfo) {
        const createToTokenAccountInstruction = createAssociatedTokenAccountInstruction(
          fromPublicKey,
          toTokenAddress,
          toPublicKey,
          mintPublicKey
        );
        transaction.add(createToTokenAccountInstruction);
      }

      // Crear instrucción de transferencia
      const transferInstruction = createTransferInstruction(
        fromTokenAddress,
        toTokenAddress,
        fromPublicKey,
        adjustedAmount,
        []
      );
      transaction.add(transferInstruction);

      // Obtener un blockhash reciente
      const { blockhash } = await TokenRewardManager.SOLANA_CONNECTION.getRecentBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPublicKey;

      // Serializar la transacción
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      }).toString('base64');

      // Actualizar la transacción en la base de datos con la transacción serializada
      await prisma.transaction.update({
        where: { id: dbTransaction.id },
        data: {
          encodedTransaction: serializedTransaction
        }
      });

      return {
        success: true,
        transactionId: dbTransaction.id,
        encodedTransaction: serializedTransaction,
        sender: fromAddress,
        receiver: toAddress,
        amount: amount
      };
    } catch (error) {
      console.error('Error generando transacción de transferencia:', error);
      throw error;
    }
  }

  /**
   * Confirma una transacción ya firmada y enviada a la red
   * @param {string} transactionId - ID de la transacción en la base de datos
   * @param {string} txHash - Hash de la transacción en la blockchain
   * @returns {Object} Resultado de la confirmación
   */
  static async confirmTransaction(transactionId, txHash) {
    try {
      // Buscar la transacción en la base de datos
      const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
          sender: true,
          receiver: true
        }
      });

      if (!transaction) {
        throw new Error(`Transaction with ID ${transactionId} not found`);
      }

      // Actualizar la transacción con el hash y marcarla como completada
      const updatedTransaction = await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          blockchainTxHash: txHash,
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      // Actualizar balances de tokens
      if (transaction.type === 'TRANSFER' || transaction.type === 'SUBSCRIPTION') {
        // Restar balance al emisor
        await TokenRewardManager.updateTokenBalance(
          transaction.sender.walletAddress,
          -transaction.amount
        );

        // Sumar balance al receptor
        await TokenRewardManager.updateTokenBalance(
          transaction.receiver.walletAddress,
          transaction.amount
        );
      }

      return {
        success: true,
        transaction: updatedTransaction,
        message: `Transaction confirmed with hash: ${txHash}`
      };
    } catch (error) {
      console.error('Error confirming transaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtiene el balance de tokens de una wallet
   * @param {string} walletAddress - Dirección de la wallet a consultar
   * @returns {Object} Información del balance
   */
  static async getTokenBalance(walletAddress) {
    try {
      if (!TokenRewardManager.TOKEN_MINT_ADDRESS) {
        throw new Error('TokenRewardManager no inicializado. Llama a initialize() primero.');
      }

      // Buscar usuario
      const user = await prisma.user.findUnique({
        where: { walletAddress },
        include: {
          tokenBalances: {
            where: {
              tokenMintAddress: TokenRewardManager.TOKEN_MINT_ADDRESS
            }
          }
        }
      });

      if (!user) {
        // Crear usuario si no existe
        await prisma.user.create({
          data: { walletAddress }
        });

        return {
          success: true,
          address: walletAddress,
          balance: 0,
          token: TokenRewardManager.TOKEN_MINT_ADDRESS,
          tokenSymbol: TokenRewardManager.TOKEN_SYMBOL,
          decimals: TokenRewardManager.TOKEN_DECIMALS
        };
      }

      // Si el usuario existe pero no tiene balance de este token
      if (user.tokenBalances.length === 0) {
        return {
          success: true,
          address: walletAddress,
          balance: 0,
          token: TokenRewardManager.TOKEN_MINT_ADDRESS,
          tokenSymbol: TokenRewardManager.TOKEN_SYMBOL,
          decimals: TokenRewardManager.TOKEN_DECIMALS
        };
      }

      // Devolver balance existente
      return {
        success: true,
        address: walletAddress,
        balance: user.tokenBalances[0].balance,
        token: TokenRewardManager.TOKEN_MINT_ADDRESS,
        tokenSymbol: TokenRewardManager.TOKEN_SYMBOL,
        decimals: TokenRewardManager.TOKEN_DECIMALS,
        lastUpdated: user.tokenBalances[0].lastUpdated
      };
    } catch (error) {
      console.error('Error obteniendo balance de tokens:', error);
      return {
        success: false,
        address: walletAddress,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default TokenRewardManager;
