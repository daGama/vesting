import { ethers } from "hardhat";
import { CONFIG } from "./argumentsToken";
const { prod: DEPLOY_CONFIG } = CONFIG;

async function main() {
  const {
    owner,
    totalSupply
  } = DEPLOY_CONFIG;

  console.log('Deploy params: ', {
    owner,
    totalSupply
  });

  const Token = await ethers.deployContract("DAGAMAToken", [owner, totalSupply]);

  await Token.waitForDeployment();

  console.log(
    `Token deployed to ${Token.target}`
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
