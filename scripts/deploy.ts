import { ethers } from "hardhat";
import { CONFIG } from "./arguments";
const { prod: DEPLOY_CONFIG } = CONFIG;

async function main() {
  const {
    startRoundIncrement,
    cliffDuration,
    vestingDuration,
    tgep,
    cap,
    tokenContract,
    treasure,
  } = DEPLOY_CONFIG;

  const startRound = Math.floor(Date.now() / 1000) + startRoundIncrement;
  console.log('Deploy params: ', {
    startRound,
    cliffDuration,
    vestingDuration,
    tgep,
    cap,
    tokenContract,
    treasure,
  });
  console.log(`For verify replace in arguments startRoundIncrement with ${startRound}`);

  const Vesting = await ethers.deployContract("Vesting", [
    startRound,
    cliffDuration,
    vestingDuration,
    tgep,
    cap,
    tokenContract,
    treasure,
  ]);

  await Vesting.waitForDeployment();

  console.log(
    `Vesting deployed to ${Vesting.target}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
