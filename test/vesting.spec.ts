import { use, expect } from 'chai';
import BigNumber from "bignumber.js";
import chaiBignumber from "chai-bignumber";
use(chaiBignumber(BigNumber));
import { ethers, network } from 'hardhat';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';
import {
  MockERC20Token,
  TimelockController,
  Vesting,
} from '../typechain-types';
import { MaxUint256 } from 'ethers';
import { soliditySha3 } from 'web3-utils';
import { CONFIG } from '../scripts/arguments';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
const { test: DEPLOY_CONFIG } = CONFIG;

const ERC20_TOKEN_BALANCE = 1e8;
const LOCK_TIME = 2 * 24 * 3600;

describe("Vesting contract", function () {
  async function deploy(this: any) {
    const {
      startRoundIncrement = DEPLOY_CONFIG.startRoundIncrement || 0,
      cliffDuration = DEPLOY_CONFIG.cliffDuration || 0,
      vestingDuration = DEPLOY_CONFIG.vestingDuration || 0,
      tgep = DEPLOY_CONFIG.tgep || 0,
      cap = DEPLOY_CONFIG.cap || 0,
    } = this;

    const [owner, user, treasure, multisigOwner] = await ethers.getSigners();

    const ercFactory = await ethers.getContractFactory('MockERC20Token');
    const tokenERC20: MockERC20Token = await ercFactory.deploy('DAGAMAToken', 'UMP', ERC20_TOKEN_BALANCE);
    await tokenERC20.waitForDeployment();

    const timeLockFactory = await ethers.getContractFactory('TimelockController');
    const timeLock: TimelockController = await timeLockFactory.deploy(LOCK_TIME, [owner, multisigOwner], [owner, multisigOwner], owner);
    await timeLock.waitForDeployment();

    const factory = await ethers.getContractFactory('Vesting');

    const vesting: Vesting = await factory.deploy(
      multisigOwner,
      Math.floor(Date.now() / 1000) + startRoundIncrement,
      cliffDuration,
      vestingDuration,
      tgep,
      cap,
      tokenERC20.target,
      treasure,
      timeLock.target
    );
    await vesting.waitForDeployment();

    // lock tokens in vesting
    await tokenERC20.approve(owner, MaxUint256);
    await tokenERC20.transfer(vesting.target, cap);

    // grant role to call from staking to timelock
    const EXECUTOR_ROLE = soliditySha3('EXECUTOR_ROLE')!;
    await timeLock.grantRole(EXECUTOR_ROLE, vesting.target);
    const PROPOSER_ROLE = soliditySha3('PROPOSER_ROLE')!;
    await timeLock.grantRole(PROPOSER_ROLE, vesting.target);

    return {
      vesting,
      tokenERC20,
      owner,
      user,
      treasure,
      multisigOwner,
      timeLock
    };
  }

  const reserveTokens = async (vesting: Vesting, user: HardhatEthersSigner, beneficiary: HardhatEthersSigner, amount: number) => {
    await vesting.connect(user).scheduleReserveTokens(beneficiary, amount);

    await mine(2, {
      interval: LOCK_TIME
    });

    return await vesting.connect(user).executeReserveTokens(beneficiary, amount);
  }

  const withdrawUnpurchasedFunds = async (vesting: Vesting, user: HardhatEthersSigner) => {
    await vesting.connect(user).scheduleWithdrawUnpurchasedFunds();

    await mine(8, {
      interval: LOCK_TIME
    });

    return await vesting.connect(user).executeWithdrawUnpurchasedFunds();
  }

  beforeEach(async function () {
    await network.provider.send("hardhat_reset")
  })

  describe("Vesting", function () {
    it("Should reserve funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, user, multisigOwner } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await reserveTokens(vesting, multisigOwner, owner, vestingAmount);

      await mine(10);

      const purchasedByUser = await vesting.purchasedByUser(owner.address);
      expect(purchasedByUser).to.equal(vestingAmount);

      const purchased = await vesting.purchased();
      expect(purchased).to.equal(vestingAmount);

      const availableForPurchase = await vesting.availableForPurchase();
      expect(availableForPurchase).to.equal(cap - vestingAmount);

      await expect(reserveTokens(vesting, multisigOwner, user, vestingAmount)).to.emit(vesting, "TokenReserved").withArgs(user, vestingAmount);
    });

    it("Should fail reserve with cap exceeded", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, multisigOwner } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e10;
      await expect(reserveTokens(vesting, multisigOwner, owner, vestingAmount)).to.be.revertedWith('cap exceeded');
    });

    it("Should fail reserve with round finished", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 600;
      const vestingDuration = 30 * 24 * 3600;
      const { vesting, tokenERC20, owner, multisigOwner } = await loadFixture(deploy.bind({
        cap,
        startRoundIncrement,
        cliffDuration,
        vestingDuration
      }));

      await mine(cliffDuration + vestingDuration + startRoundIncrement + 1, {
        interval: 1
      });

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e10;
      await expect(reserveTokens(vesting, multisigOwner, owner, vestingAmount)).to.be.revertedWith('round finished');
    });

    it("Should claim reward", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 2*LOCK_TIME;
      const vestingDuration = 30 * 24 * 3600;
      const { vesting, tokenERC20, owner, multisigOwner } = await loadFixture(deploy.bind({
        cap,
        startRoundIncrement,
        cliffDuration,
        vestingDuration
      }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await reserveTokens(vesting, multisigOwner, owner, vestingAmount);

      const claimableForUserBefore = await vesting.claimableForUser(owner.address);
      expect(claimableForUserBefore).to.equal(0);

      await mine(cliffDuration + vestingDuration + startRoundIncrement, {
        interval: 1
      });

      const claimableForUserAfter = await vesting.claimableForUser(owner.address);
      expect(claimableForUserAfter).to.equal(vestingAmount);

      // check balance before claim
      const balanceBefore = (await tokenERC20.balanceOf(owner)).toString();

      // claim
      await expect(vesting.claim(claimableForUserAfter)).to.emit(vesting, "TokenClaimed").withArgs(owner, claimableForUserAfter);

      // check balance after claim
      const balanceAfter = (await tokenERC20.balanceOf(owner)).toString();
      const expectedBalance = new BigNumber(balanceBefore).plus(claimableForUserAfter.toString());
      expect(balanceAfter).to.be.bignumber.equal(expectedBalance);
    });

    it("Should fail claim with account is not beneficiary", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, multisigOwner } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e10;
      await expect(vesting.claim(vestingAmount)).to.be.revertedWith('account is not beneficiary');
    });

    it("Should fail claim with insufficient funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, multisigOwner } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e5;
      await reserveTokens(vesting, multisigOwner, owner, vestingAmount);

      await expect(vesting.claim(vestingAmount + 1)).to.be.revertedWith('insufficient funds');
    });

    it("Should withdraw funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 600;
      const vestingDuration = 30 * 24 * 3600;
      const { vesting, tokenERC20, owner, user, treasure, multisigOwner } = await loadFixture(deploy.bind({
        cap,
        startRoundIncrement,
        cliffDuration,
        vestingDuration
      }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await reserveTokens(vesting, multisigOwner, owner, vestingAmount);

      await mine(cliffDuration + vestingDuration + startRoundIncrement, {
        interval: 1
      });

      // check balance before withdraw
      const balanceBefore = (await tokenERC20.balanceOf(treasure)).toString();

      // failed withdraw by nonAdmin
      await expect(withdrawUnpurchasedFunds(vesting,user))
        .to.be.revertedWithCustomError(vesting, 'OwnableUnauthorizedAccount');

      // withdraw by admin
      const amount = new BigNumber(cap).minus(vestingAmount);
      await expect(withdrawUnpurchasedFunds(vesting,multisigOwner)).to.emit(vesting, "FundsWithdrawal").withArgs(amount);

      // check balance after withdraw
      const balanceAfter = (await tokenERC20.balanceOf(treasure)).toString();
      const expectedBalance = new BigNumber(balanceBefore).plus(amount);
      expect(balanceAfter).to.be.bignumber.equal(expectedBalance);
    });

    it("Should fail withdraw with round has not finished yet", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 600;
      const vestingDuration = 30 * 24 * 3600;
      const { vesting, tokenERC20, owner, multisigOwner } = await loadFixture(deploy.bind({
        cap,
        startRoundIncrement,
        cliffDuration,
        vestingDuration
      }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await reserveTokens(vesting, multisigOwner, owner, vestingAmount);

      await mine(10);

      await expect(withdrawUnpurchasedFunds(vesting,multisigOwner)).to.be.revertedWith('round has not finished yet');
    });
  });

  describe("Roles", function () {
    it("Should check role", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, user, multisigOwner } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));

      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;

      await expect(reserveTokens(vesting, user, owner, vestingAmount))
        .to.be.revertedWithCustomError(vesting, 'OwnableUnauthorizedAccount');

      // connect multisig wallet
      await reserveTokens(vesting, multisigOwner, owner, vestingAmount);

      const purchasedByUser = await vesting.purchasedByUser(owner.address);
      expect(purchasedByUser).to.equal(vestingAmount);
    });
  });
});