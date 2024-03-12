import { ethers } from "hardhat";

async function main() {
  const Token = await ethers.deployContract("DAGAMAToken", []);

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
