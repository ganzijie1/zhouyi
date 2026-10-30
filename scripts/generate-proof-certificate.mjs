import { writeFile } from 'node:fs/promises';
import { generateProofCertificate, serializeProofCertificate } from '../src/domain/proofs.js';

await writeFile(new URL('../public/data/proof-certificate.json', import.meta.url), serializeProofCertificate(await generateProofCertificate()));
console.log('证明证书已从有限域枚举器重建。');
