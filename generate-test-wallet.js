// generate-test-wallet.js
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function generateAndFundWallet() {
  try {
    console.log('Generating new Solana test wallet...');

    // Generar un nuevo par de claves
    const keypair = Keypair.generate();

    // Obtener la dirección pública
    const publicKey = keypair.publicKey.toString();

    console.log(`✅ New wallet generated!`);
    console.log(`Public Key: ${publicKey}`);

    // Convertir el array de bytes a un formato que podamos guardar
    const secretKey = JSON.stringify(Array.from(keypair.secretKey));

    // Guardar la clave secreta en un archivo
    const walletDir = path.resolve('./wallet');

    // Crear directorio wallet si no existe
    if (!fs.existsSync(walletDir)) {
      fs.mkdirSync(walletDir);
    }

    const keyFilePath = path.resolve(walletDir, 'devnet-wallet.json');
    fs.writeFileSync(keyFilePath, secretKey);

    console.log(`✅ Secret key saved to ${keyFilePath}`);
    console.log('⚠️ IMPORTANT: Keep this file secure and never share it!');

    // Solicitar SOL de prueba del faucet devnet
    console.log('Requesting SOL from Devnet faucet...');

    try {
      // Solicitar airdrop (2 SOL)
      const signature = await connection.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);

      // Esperar a que se confirme la transacción
      await connection.confirmTransaction(signature);

      // Verificar saldo
      const balance = await connection.getBalance(keypair.publicKey);
      console.log(`✅ Airdrop successful! Wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    } catch (airdropError) {
      console.error('Error during airdrop:', airdropError);
      console.log('The Devnet faucet might be rate limited. Try again later or fund your wallet manually.');
    }

    // Generar un objeto de configuración
    const walletConfig = {
      publicKey,
      network: 'devnet',
      generatedAt: new Date().toISOString()
    };

    // Guardar la configuración
    const configFilePath = path.resolve(walletDir, 'wallet-config.json');
    fs.writeFileSync(configFilePath, JSON.stringify(walletConfig, null, 2));

    console.log('\n--- Instructions for using this wallet ---');
    console.log('1. Add this to your environment variables or .env file:');
    console.log(`SOLANA_WALLET_PUBLIC_KEY=${publicKey}`);
    console.log(`SOLANA_WALLET_SECRET_KEY_PATH=${keyFilePath}`);
    console.log('2. In your code, load the wallet with:');
    console.log(`
// Load wallet from file
const secretKeyString = fs.readFileSync('${keyFilePath}', 'utf8');
const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
const walletKeypair = Keypair.fromSecretKey(secretKey);
const walletPublicKey = walletKeypair.publicKey.toString();
    `);

    return { keypair, publicKey };
  } catch (error) {
    console.error('Error generating wallet:', error);
    throw error;
  }
}

// Función para cargar una billetera existente desde un archivo
async function loadExistingWallet() {
  try {
    const keyFilePath = path.resolve('./wallet/devnet-wallet.json');

    if (!fs.existsSync(keyFilePath)) {
      console.log('No existing wallet found. Generating a new one...');
      return generateAndFundWallet();
    }

    console.log('Loading existing wallet...');

    // Cargar la clave secreta desde el archivo
    const secretKeyString = fs.readFileSync(keyFilePath, 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));

    // Crear el keypair desde la clave secreta
    const keypair = Keypair.fromSecretKey(secretKey);
    const publicKey = keypair.publicKey.toString();

    console.log(`✅ Wallet loaded successfully!`);
    console.log(`Public Key: ${publicKey}`);

    // Verificar saldo
    const balance = await connection.getBalance(keypair.publicKey);
    console.log(`Current wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    // Si el saldo es bajo, intentar solicitar más SOL
    if (balance < 0.5 * LAMPORTS_PER_SOL) {
      console.log('Balance is low. Requesting more SOL from Devnet faucet...');

      try {
        const signature = await connection.requestAirdrop(keypair.publicKey, 1 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(signature);

        const newBalance = await connection.getBalance(keypair.publicKey);
        console.log(`✅ Airdrop successful! New wallet balance: ${newBalance / LAMPORTS_PER_SOL} SOL`);
      } catch (airdropError) {
        console.error('Error during airdrop:', airdropError);
        console.log('The Devnet faucet might be rate limited. Try again later or fund your wallet manually.');
      }
    }

    return { keypair, publicKey };
  } catch (error) {
    console.error('Error loading wallet:', error);
    console.log('Will generate a new wallet instead.');
    return generateAndFundWallet();
  }
}

// Función para adaptar las pruebas a usar esta billetera
async function updateTestScript() {
  try {
    const { publicKey } = await loadExistingWallet();

    console.log('\nUpdating test script to use this wallet...');

    // Ruta al archivo de prueba
    const testPath = path.resolve('./test.js');

    if (!fs.existsSync(testPath)) {
      console.log('Test script not found at ./test.js');
      return;
    }

    // Leer el archivo
    let testContent = fs.readFileSync(testPath, 'utf8');

    // Actualizar la línea que define la billetera de prueba
    const walletRegex = /const testWallet = ['"].*['"]/;

    if (walletRegex.test(testContent)) {
      testContent = testContent.replace(walletRegex, `const testWallet = '${publicKey}'`);
      fs.writeFileSync(testPath, testContent);
      console.log('✅ Test script updated successfully to use the generated wallet!');
    } else {
      console.log('Could not find wallet definition in test script.');
    }
  } catch (error) {
    console.error('Error updating test script:', error);
  }
}

// Ejecutar todo
async function main() {
  try {
    // Verificar si ya hay una billetera o generar una nueva
    await loadExistingWallet();

    // Actualizar el script de prueba
    await updateTestScript();

    console.log('\n✅ All done! You can now run your tests with this Devnet wallet.');
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

main();
