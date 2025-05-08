// create-drive-ledger-token.js
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram
} from '@solana/web3.js';
import {
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getMint
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

// Configuración del token
const TOKEN_NAME = "DRIVL";
const TOKEN_SYMBOL = "DRVL";
const TOKEN_DESCRIPTION = "Drive-Ledger Mobility Data Token";
const TOKEN_DECIMALS = 6;
const INITIAL_SUPPLY = 1000000; // 1 millón de tokens

// Conexión a Solana Devnet
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// Función para cargar la billetera desde el archivo
function loadWalletKeypair() {
  try {
    const secretKeyPath = path.resolve('./wallet/devnet-wallet.json');
    const secretKeyString = fs.readFileSync(secretKeyPath, 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Error loading wallet keypair:', error);
    throw new Error('Failed to load wallet. Run generate-test-wallet.js first.');
  }
}

// Función para guardar información del token
function saveTokenInfo(mintAddress, decimals, initialSupply) {
  try {
    const tokenInfo = {
      mintAddress,
      name: TOKEN_NAME,
      symbol: TOKEN_SYMBOL,
      description: TOKEN_DESCRIPTION,
      decimals,
      initialSupply,
      network: 'devnet',
      createdAt: new Date().toISOString()
    };

    const tokenDir = path.resolve('./tokens');

    // Crear directorio si no existe
    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir);
    }

    const tokenFilePath = path.resolve(tokenDir, `${TOKEN_SYMBOL.toLowerCase()}-token-info.json`);
    fs.writeFileSync(tokenFilePath, JSON.stringify(tokenInfo, null, 2));

    console.log(`✅ Token information saved to ${tokenFilePath}`);
    return tokenFilePath;
  } catch (error) {
    console.error('Error saving token information:', error);
    throw error;
  }
}

// Función principal para crear el token
async function createToken() {
  try {
    console.log(`Creating ${TOKEN_NAME} (${TOKEN_SYMBOL}) token on Solana Devnet...`);

    // Cargar la billetera
    const walletKeypair = loadWalletKeypair();
    console.log(`Using wallet: ${walletKeypair.publicKey.toString()}`);

    // Verificar saldo para asegurarnos de tener suficiente SOL
    const balance = await connection.getBalance(walletKeypair.publicKey);
    console.log(`Wallet balance: ${balance / 1000000000} SOL`);

    if (balance < 10000000) { // Menos de 0.01 SOL
      console.error('Insufficient balance to create a token');
      throw new Error('Please fund your wallet with more SOL');
    }

    // Generar keypair para el mint
    const mintKeypair = Keypair.generate();
    console.log(`Generated mint address: ${mintKeypair.publicKey.toString()}`);

    // Calcular el espacio necesario para el mint
    const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);

    // Crear transacción
    const transaction = new Transaction();

    // Instrucción para crear la cuenta del token
    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: walletKeypair.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      lamports,
      space: MINT_SIZE,
      programId: TOKEN_PROGRAM_ID
    });

    // Instrucción para inicializar el mint
    const initMintInstruction = createInitializeMintInstruction(
      mintKeypair.publicKey,
      TOKEN_DECIMALS,
      walletKeypair.publicKey,
      walletKeypair.publicKey
    );

    // Añadir instrucciones a la transacción
    transaction.add(createAccountInstruction);
    transaction.add(initMintInstruction);

    // Añadir un blockhash reciente
    const { blockhash } = await connection.getRecentBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletKeypair.publicKey;

    // Firmar la transacción
    transaction.sign(walletKeypair, mintKeypair);

    // Enviar la transacción
    console.log('Sending token creation transaction...');
    const signature = await connection.sendTransaction(transaction, [walletKeypair, mintKeypair]);

    // Esperar confirmación
    console.log(`Transaction sent with signature: ${signature}`);
    await connection.confirmTransaction(signature);
    console.log('✅ Token created successfully!');

    // Acuñar tokens iniciales
    console.log(`Minting initial supply of ${INITIAL_SUPPLY} ${TOKEN_SYMBOL}...`);

    // Obtener la dirección de la cuenta asociada del token para la billetera
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      walletKeypair.publicKey
    );

    // Crear cuenta asociada de token y acuñar tokens
    const mintTransaction = new Transaction();

    // Crear cuenta asociada para el token si no existe
    const accountInfo = await connection.getAccountInfo(associatedTokenAddress);

    if (!accountInfo) {
      mintTransaction.add(
        createAssociatedTokenAccountInstruction(
          walletKeypair.publicKey,
          associatedTokenAddress,
          walletKeypair.publicKey,
          mintKeypair.publicKey
        )
      );
    }

    // Acuñar los tokens
    const mintInstruction = createMintToInstruction(
      mintKeypair.publicKey,
      associatedTokenAddress,
      walletKeypair.publicKey,
      INITIAL_SUPPLY * Math.pow(10, TOKEN_DECIMALS)
    );

    mintTransaction.add(mintInstruction);

    // Añadir blockhash reciente
    const mintRecentBlockhash = await connection.getRecentBlockhash();
    mintTransaction.recentBlockhash = mintRecentBlockhash.blockhash;
    mintTransaction.feePayer = walletKeypair.publicKey;

    // Firmar y enviar la transacción
    mintTransaction.sign(walletKeypair);
    const mintSignature = await connection.sendTransaction(mintTransaction, [walletKeypair]);

    // Esperar confirmación
    await connection.confirmTransaction(mintSignature);
    console.log(`✅ Minted ${INITIAL_SUPPLY} ${TOKEN_SYMBOL} to ${walletKeypair.publicKey.toString()}`);

    // Verificar el suministro
    const mintInfo = await getMint(connection, mintKeypair.publicKey);
    console.log(`Token decimals: ${mintInfo.decimals}`);
    console.log(`Current supply: ${Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals)} ${TOKEN_SYMBOL}`);

    // Guardar información del token
    const tokenInfoPath = saveTokenInfo(
      mintKeypair.publicKey.toString(),
      mintInfo.decimals,
      INITIAL_SUPPLY
    );

    console.log('\n--- 🚗 Drive-Ledger Token Created Successfully! 🚗 ---');
    console.log(`Token Name: ${TOKEN_NAME} (${TOKEN_SYMBOL})`);
    console.log(`Token Address: ${mintKeypair.publicKey.toString()}`);
    console.log(`Decimals: ${TOKEN_DECIMALS}`);
    console.log(`Initial Supply: ${INITIAL_SUPPLY} ${TOKEN_SYMBOL}`);
    console.log('\nTo use this token in your application:');
    console.log(`1. Add this to your environment variables or .env file:`);
    console.log(`TOKEN_MINT_ADDRESS=${mintKeypair.publicKey.toString()}`);
    console.log(`2. In your TokenRewardService, initialize with this token address`);

    return {
      mintAddress: mintKeypair.publicKey.toString(),
      tokenInfoPath
    };
  } catch (error) {
    console.error('Error creating token:', error);
    throw error;
  }
}

// Función para actualizar la configuración
async function updateTokenConfig() {
  try {
    const { mintAddress } = await createToken();

    console.log('\nUpdating token configuration in services...');

    // Ruta al archivo TokenRewardService
    const servicePath = path.resolve('./services/token-reward.service.js');

    if (!fs.existsSync(servicePath)) {
      console.log('TokenRewardService not found at expected path');
      return;
    }

    // Leer el archivo
    let serviceContent = fs.readFileSync(servicePath, 'utf8');

    // Actualizar la variable tokenMintAddress
    const tokenAddressRegex = /static tokenMintAddress = .*?;/;
    const tokenSymbolRegex = /static tokenSymbol = ['"].*?['"];/;

    if (tokenAddressRegex.test(serviceContent)) {
      serviceContent = serviceContent.replace(tokenAddressRegex, `static tokenMintAddress = "${mintAddress}";`);
    }

    if (tokenSymbolRegex.test(serviceContent)) {
      serviceContent = serviceContent.replace(tokenSymbolRegex, `static tokenSymbol = "${TOKEN_SYMBOL}";`);
    }

    // Guardar el archivo actualizado
    fs.writeFileSync(servicePath, serviceContent);
    console.log('✅ TokenRewardService updated successfully with the new token address!');

  } catch (error) {
    console.error('Error updating token configuration:', error);
  }
}

// Ejecutar
updateTokenConfig();
