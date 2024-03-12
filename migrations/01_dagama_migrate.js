const Migrations = artifacts.require("DAGAMA");

module.exports = function(deployer, network, accounts) {
  const deployerAddress = accounts[0];
  deployer.deploy(Migrations, deployerAddress);
};
