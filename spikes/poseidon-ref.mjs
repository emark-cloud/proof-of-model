// Off-chain Poseidon reference (circom-compatible, BN254, t=3).
// This is the cross-impl oracle for the Stylus contract's hash2(a,b).
// poseidon-lite's poseidon2 == circomlib Poseidon of 2 inputs == light-poseidon new_circom(2).
import { poseidon2 } from "poseidon-lite";

const cases = [
  [1n, 2n],
  [0n, 0n],
  [
    7853200120776062878684798364095072458815029376092732009249414926327459813530n,
    42n,
  ],
];

for (const [a, b] of cases) {
  const h = poseidon2([a, b]);
  console.log(`poseidon2(${a}, ${b})`);
  console.log(`  dec: ${h}`);
  console.log(`  hex: 0x${h.toString(16).padStart(64, "0")}`);
}
