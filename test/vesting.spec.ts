import { use, expect } from 'chai';
import BigNumber from "bignumber.js";
import chaiBignumber from "chai-bignumber";
use(chaiBignumber(BigNumber));
import { ethers, network } from 'hardhat';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';
import {
  MockERC20Token,
  Vesting,
} from '../typechain-types';
import { MaxUint256 } from 'ethers';
import { soliditySha3 } from 'web3-utils';
import { CONFIG } from '../scripts/arguments';
const { test: DEPLOY_CONFIG} = CONFIG;

const ERC20_TOKEN_BALANCE = 1e8;

describe("Vesting contract", function () {
  async function deploy(this: any) {
    const {
      startRoundIncrement = DEPLOY_CONFIG.startRoundIncrement || 0, 
      cliffDuration = DEPLOY_CONFIG.cliffDuration || 0,
      vestingDuration = DEPLOY_CONFIG.vestingDuration || 0,
      tgep = DEPLOY_CONFIG.tgep || 0,
      cap = DEPLOY_CONFIG.cap || 0,
    } = this;

    const [owner, user, treasure] = await ethers.getSigners();

    const ercFactory = await ethers.getContractFactory('MockERC20Token');
    const tokenERC20: MockERC20Token = await ercFactory.deploy('DAGAMA Token', 'DAGAMA', ERC20_TOKEN_BALANCE);
    await tokenERC20.waitForDeployment();

    const factory = await ethers.getContractFactory('Vesting');

    const vesting: Vesting = await factory.deploy(
      Math.floor(Date.now() / 1000) + startRoundIncrement,
      cliffDuration,
      vestingDuration,
      tgep,
      cap,
      tokenERC20.target,
      treasure
    );
    await vesting.waitForDeployment();

    // lock tokens in vesting
    await tokenERC20.approve(owner, MaxUint256);
    await tokenERC20.transfer(vesting.target, cap);

    const managerRole = soliditySha3('MANAGER_ROLE')!;

    return {
      vesting,
      tokenERC20,
      owner,
      user,
      treasure,
      managerRole
    };
  }

  beforeEach(async function () {
    await network.provider.send("hardhat_reset")
  })

  describe("Vesting", function () {
    it("Should reserve funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await vesting.reserveTokens(owner, vestingAmount);

      await mine(10);

      const purchasedByUser = await vesting.purchasedByUser(owner.address);
      expect(purchasedByUser).to.equal(vestingAmount);

      const purchased = await vesting.purchased();
      expect(purchased).to.equal(vestingAmount);

      const availableForPurchase = await vesting.availableForPurchase();
      expect(availableForPurchase).to.equal(cap - vestingAmount);

      await expect(vesting.reserveTokens(user, vestingAmount)).to.emit(vesting, "TokenReserved").withArgs(user, vestingAmount);
    });

    it("Should fail reserve with cap exceeded", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e10;
      await expect(vesting.reserveTokens(owner, vestingAmount)).to.be.revertedWith('cap exceeded');
    });

    it("Should fail reserve with round finished", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 600;
      const vestingDuration = 600;
      const { vesting, tokenERC20, owner, user } = await loadFixture(deploy.bind({
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
      await expect(vesting.reserveTokens(owner, vestingAmount)).to.be.revertedWith('round finished');
    });

    it("Should claim reward", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 600;
      const vestingDuration = 600;
      const { vesting, tokenERC20, owner, user } = await loadFixture(deploy.bind({
         cap, 
         startRoundIncrement, 
         cliffDuration,
         vestingDuration
        }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await vesting.reserveTokens(owner, vestingAmount);

      const claimableForUserBefore = await vesting.claimableForUser(owner.address);
      expect(claimableForUserBefore).to.equal(0);

      await mine(cliffDuration + vestingDuration + startRoundIncrement, {
        interval: 1
      });

      const claimableForUserAfter = await vesting.claimableForUser(owner.address);
      expect(claimableForUserAfter).to.equal(vestingAmount);

      // check balance before claim
      const balanceBefore =  (await tokenERC20.balanceOf(owner)).toString();

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
      const { vesting, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e10;
      await expect(vesting.claim(vestingAmount)).to.be.revertedWith('account is not beneficiary');
    });

    it("Should fail claim with insufficient funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e5;
      await vesting.reserveTokens(owner, vestingAmount);

      await expect(vesting.claim(vestingAmount + 1)).to.be.revertedWith('insufficient funds');
    });

    it("Should withdraw funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 600;
      const vestingDuration = 600;
      const { vesting, tokenERC20, owner, user, treasure } = await loadFixture(deploy.bind({
         cap, 
         startRoundIncrement, 
         cliffDuration,
         vestingDuration
        }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await vesting.reserveTokens(owner, vestingAmount);

      await mine(cliffDuration + vestingDuration + startRoundIncrement, {
        interval: 1
      });

      // check balance before withdraw
      const balanceBefore = (await tokenERC20.balanceOf(treasure)).toString();

      // failed withdraw by nonAdmin
      await expect(vesting.connect(user).withdrawUnpurchasedFunds())
        .to.be.revertedWithCustomError(vesting, 'AccessControlUnauthorizedAccount');

      // withdraw by admin
      const amount = new BigNumber(cap).minus(vestingAmount);
      await expect(vesting.withdrawUnpurchasedFunds()).to.emit(vesting, "FundsWithdrawal").withArgs(amount);

      // check balance after withdraw
      const balanceAfter = (await tokenERC20.balanceOf(treasure)).toString();
      const expectedBalance = new BigNumber(balanceBefore).plus(amount);
      expect(balanceAfter).to.be.bignumber.equal(expectedBalance);
    });

    it("Should fail withdraw with round has not finished yet", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const cliffDuration = 600;
      const vestingDuration = 600;
      const { vesting, tokenERC20, owner, user, treasure } = await loadFixture(deploy.bind({
         cap, 
         startRoundIncrement, 
         cliffDuration,
         vestingDuration
        }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;
      await vesting.reserveTokens(owner, vestingAmount);

      await mine(10);

      await expect(vesting.withdrawUnpurchasedFunds()).to.be.revertedWith('round has not finished yet');
    });
  });

  describe("Roles", function () {
    it("Should grant manager role", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { vesting, tokenERC20, owner, user, managerRole } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(vesting.target, MaxUint256);
      const vestingAmount = 2e4;

      await expect(vesting.connect(user).reserveTokens(owner, vestingAmount))
        .to.be.revertedWithCustomError(vesting, 'AccessControlUnauthorizedAccount');

      // grant role
      await vesting.grantRole(managerRole, user);
      await vesting.reserveTokens(owner, vestingAmount);

      const purchasedByUser = await vesting.purchasedByUser(owner.address);
      expect(purchasedByUser).to.equal(vestingAmount);
    });
  });
});