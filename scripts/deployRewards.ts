import { ethers } from "hardhat";
import { CONFIG } from "./argumentsRewards";
const { prod: DEPLOY_CONFIG } = CONFIG;

async function main() {
  const {
    owner,
    startRoundIncrement,
    cap,
    tokenContract,
  } = DEPLOY_CONFIG;

  const startRound = Math.floor(Date.now() / 1000) + startRoundIncrement;
  console.log('Deploy params: ', {
    owner,
    startRound,
    cap,
    tokenContract,
  });
  console.log(`For verify replace in arguments startRoundIncrement with ${startRound}`);

  const RewardsPool = await ethers.deployContract("RewardsPool", [
    owner,
    startRound,
    cap,
    tokenContract,
  ]);

  await RewardsPool.waitForDeployment();

  console.log(
    `RewardsPool deployed to ${RewardsPool.target}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
