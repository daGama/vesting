import { use, expect } from 'chai';
import BigNumber from "bignumber.js";
import chaiBignumber from "chai-bignumber";
use(chaiBignumber(BigNumber));
import { ethers, network } from 'hardhat';
import { loadFixture, mine } from '@nomicfoundation/hardhat-network-helpers';
import {
  MockERC20Token,
  TestRewardsPool,
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
      cap = DEPLOY_CONFIG.cap || 0,
    } = this;

    const [owner, user] = await ethers.getSigners();

    const ercFactory = await ethers.getContractFactory('MockERC20Token');
    const tokenERC20: MockERC20Token = await ercFactory.deploy('DAGAMA Token', 'DAGAMA', ERC20_TOKEN_BALANCE);
    await tokenERC20.waitForDeployment();

    const factory = await ethers.getContractFactory('TestRewardsPool');

    const rewardsPool: TestRewardsPool = await factory.deploy(
      Math.floor(Date.now() / 1000) + startRoundIncrement,
      cap,
      tokenERC20.target
    );
    await rewardsPool.waitForDeployment();

    // lock tokens in vesting
    await tokenERC20.approve(owner, MaxUint256);
    await tokenERC20.transfer(rewardsPool.target, cap);

    const managerRole = soliditySha3('MANAGER_ROLE')!;

    return {
      rewardsPool,
      tokenERC20,
      owner,
      user,
      managerRole
    };
  }

  beforeEach(async function () {
    await network.provider.send("hardhat_reset")
  })

  describe("Rewards Pool", function () {
    it("Should reserve funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { rewardsPool, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(rewardsPool.target, MaxUint256);
      const vestingAmount = 1e4;
      await rewardsPool.reserveTokens(owner, vestingAmount);

      await mine(10);

      const purchasedByUser = await rewardsPool.purchasedByUser(owner.address);
      expect(purchasedByUser).to.equal(vestingAmount);

      const purchased = await rewardsPool.purchased();
      expect(purchased).to.equal(vestingAmount);

      const availableForPurchase = await rewardsPool.availableForPurchase();
      expect(availableForPurchase).to.equal(cap - vestingAmount);

      await expect(rewardsPool.reserveTokens(user, vestingAmount)).to.emit(rewardsPool, "TokenReserved").withArgs(user, vestingAmount);
    });

    it("Should fail reserve with cap exceeded", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { rewardsPool, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(rewardsPool.target, MaxUint256);
      const vestingAmount = 2e10;
      await expect(rewardsPool.reserveTokens(owner, vestingAmount)).to.be.revertedWith('cap exceeded');
    });

    it("Should claim reward", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { rewardsPool, tokenERC20, owner, user } = await loadFixture(deploy.bind({
         cap, 
         startRoundIncrement, 
        }));
      
      await tokenERC20.approve(rewardsPool.target, MaxUint256);
      const vestingAmount = 1e6;
      await rewardsPool.reserveTokens(owner, vestingAmount);

      const claimableForUserBefore = await rewardsPool.claimableForUser(owner.address);
      expect(claimableForUserBefore).to.equal(0);

      // 1 month
      await mine(startRoundIncrement + 4 * 7 * 24 * 3600, {
        interval: 1
      });

      const claimableForUserAfter1month = await rewardsPool.claimableForUser(owner.address);
      const calculated1month = Math.floor(vestingAmount * 0.004);
      expect(claimableForUserAfter1month).to.equal(calculated1month);

      // 2 month
      await mine(4 * 7 * 24 * 3600, {
        interval: 1
      });

      const claimableForUserAfter2month = await rewardsPool.claimableForUser(owner.address);
      const calculated2month = Math.floor((vestingAmount - calculated1month) * 0.004);
      expect(claimableForUserAfter2month).to.equal(calculated1month + calculated2month);

      // check balance before claim
      const balanceBefore =  (await tokenERC20.balanceOf(owner)).toString();

      // claim
      await expect(rewardsPool.claim(claimableForUserAfter1month)).to.emit(rewardsPool, "TokenClaimed").withArgs(owner, claimableForUserAfter1month);

      // check balance after claim
      const balanceAfter = (await tokenERC20.balanceOf(owner)).toString();
      const expectedBalance = new BigNumber(balanceBefore).plus(claimableForUserAfter1month.toString());
      expect(balanceAfter).to.be.bignumber.equal(expectedBalance);

      // 3 month
      await mine(4 * 7 * 24 * 3600, {
        interval: 1
      });

      const claimableForUserAfter3month = await rewardsPool.claimableForUser(owner.address);
      const calculated3month = Math.floor((vestingAmount - calculated1month) * 0.004);
      expect(claimableForUserAfter3month).to.equal(calculated3month);
    });

    it("Should fail claim with account is not beneficiary", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { rewardsPool, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(rewardsPool.target, MaxUint256);
      const vestingAmount = 2e10;
      await expect(rewardsPool.claim(vestingAmount)).to.be.revertedWith('account is not beneficiary');
    });

    it("Should fail claim with insufficient funds", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { rewardsPool, tokenERC20, owner, user } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(rewardsPool.target, MaxUint256);
      const vestingAmount = 2e5;
      await rewardsPool.reserveTokens(owner, vestingAmount);

      await expect(rewardsPool.claim(vestingAmount + 1)).to.be.revertedWith('insufficient funds');
    });
  });

  describe("Roles", function () {
    it("Should grant manager role", async function () {
      const cap = 1e10;
      const startRoundIncrement = 60;
      const { rewardsPool, tokenERC20, owner, user, managerRole } = await loadFixture(deploy.bind({ cap, startRoundIncrement }));
      
      await tokenERC20.approve(rewardsPool.target, MaxUint256);
      const vestingAmount = 2e4;

      await expect(rewardsPool.connect(user).reserveTokens(owner, vestingAmount))
        .to.be.revertedWithCustomError(rewardsPool, 'AccessControlUnauthorizedAccount');

      // grant role
      await rewardsPool.grantRole(managerRole, user);
      await rewardsPool.reserveTokens(owner, vestingAmount);

      const purchasedByUser = await rewardsPool.purchasedByUser(owner.address);
      expect(purchasedByUser).to.equal(vestingAmount);
    });
  });
});