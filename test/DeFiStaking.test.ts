import {
  time,
  loadFixture,
  mine,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

describe("DeFiStaking", function () {
  const totalSupply = BigInt(10 ** (8 + 18)); //100MM
  const initialRewards = (totalSupply * BigInt(8)) / BigInt(10); //80% of total supply or 80MM

  async function deployFixture() {
    const Token = await ethers.getContractFactory("DeFiToken");
    let token = await Token.deploy("DeFi", "DEFI", totalSupply);
    await token.waitForDeployment();

    const Staking = await ethers.getContractFactory("DeFiStaking");
    const staking = await Staking.deploy(token.target);
    await staking.waitForDeployment();

    await token.transfer(staking.target, initialRewards);

    return [token, staking];
  }

  describe("Deployment", function () {
    let token: Contract, staking: Contract;

    beforeEach(async function () {
      [token, staking] = await loadFixture(deployFixture);
    });

    it("Should have DeFi (DEFI) token", async function () {
      expect(await staking.token()).to.eq(token.target);
    });
    it("Should have 80,000,000 token balance", async function () {
      expect(await token.balanceOf(staking.target)).to.eq(initialRewards);
    });
    it("Should have 80,000,000 reward balance", async function () {
      expect(await staking.rewardBalance()).to.eq(initialRewards);
    });
  });

  describe("Staking", function () {
    let token: Contract, staking: Contract;
    let owner: Signer;
    let staker: Signer;
    let initialStakerBalance: BigInt;

    beforeEach(async function () {
      [token, staking] = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      owner = signers[0];
      staker = signers[1];
      initialStakerBalance = ethers.parseEther("1000");
    });

    it("Should increase token balance in contract", async function () {
      await token.transfer(staker.address, initialStakerBalance);
      const amount = ethers.parseEther("1");

      await token.connect(staker).approve(staking.target, amount);
      expect(await token.balanceOf(staker)).to.eq(initialStakerBalance);
      expect(await token.balanceOf(staking)).to.eq(initialRewards);

      await staking.connect(staker).stake(amount);
      expect(await token.balanceOf(staker)).to.eq(
        initialStakerBalance - amount
      );
      expect(await token.balanceOf(staking)).to.eq(initialRewards + amount);

      // changeTokenBalances is always returning true
      // expect(
      //   await staking.connect(staker).stake(amount)
      // ).to.changeTokenBalances(
      //   token,
      //   [owner, staker],
      //   [amount, amount * BigInt(-1)]
      // );
    });

    describe("Success", function () {
      let initialStake = ethers.parseEther("1");
      beforeEach(async function () {
        await token.transfer(staker.address, initialStakerBalance);
        await token.connect(staker).approve(staking.target, initialStake);
        await staking.connect(staker).stake(initialStake);
      });

      it("Should increase total staked", async function () {
        expect(await staking.totalStaked()).to.eq(initialStake);
      });

      // already covered above
      // it("Should increase token balance in contract", async function () {
      //   expect(await token.balanceOf(staking.target)).to.eq(
      //     initialRewards + initialStake
      //   );
      // });

      it("Should'nt change the reward balance", async function () {
        expect(await staking.rewardBalance()).to.eq(initialRewards);
      });
    });

    describe("Failures", function () {
      it("Shouldn't stake with 0 amount", async function () {
        await expect(staking.connect(staker).stake(0)).to.be.revertedWith(
          "amount cannot be zero"
        );
      });

      it("Should revert if staking balance not approved", async function () {
        await expect(
          staking.connect(staker).stake(ethers.parseEther("1"))
        ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
      });

      it("Shouldn't stake with no balance", async function () {
        let amount = ethers.parseEther("1");
        await token.connect(staker).approve(owner, amount);
        await expect(
          staking.connect(staker).stake(ethers.parseEther("1"))
        ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
      });
    });
  });

  describe("Rewards", function () {
    let token: Contract, staking: Contract;
    let owner: Signer;
    let staker: Signer;
    let initialStakerBalance = ethers.parseEther("1000");

    beforeEach(async function () {
      [token, staking] = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      owner = signers[0];
      staker = signers[1];
    });

    describe("Success", function () {
      beforeEach(async function () {
        await token.transfer(staker.address, initialStakerBalance);
        await token
          .connect(staker)
          .approve(staking.target, initialStakerBalance);
        await staking.connect(staker).stake(initialStakerBalance);
      });

      it("Should have 1/14400 rewards after 1 block", async function () {
        await mine(1);
        expect(await staking.getRewards(staker.address)).to.eq(
          BigInt(10 ** 18) / BigInt(14400)
        );
      });

      it("Should have 1/1440 rewards after 1 minute(10 blocks)", async function () {
        await mine(10);
        expect(await staking.getRewards(staker.address)).to.eq(
          BigInt(10 ** 18) / BigInt(1440)
        );
      });

      it("Should have 1/24 rewards after 1 hour(600 blocks)", async function () {
        await mine(600);
        expect(await staking.getRewards(staker.address)).to.eq(
          BigInt(10 ** 18) / BigInt(24)
        );
      });

      it("Should have 1 reward after 1 day", async function () {
        // await time.increase(60 * 60 * 24);
        await mine(14400);
        expect(await staking.getRewards(staker)).to.eq(ethers.parseEther("1"));
      });
    });

    describe("Failures", function () {
      it("Should return 0 when not staking", async function () {
        expect(await staking.getRewards(staker)).to.eq(0);
      });
    });
  });

  describe("Withdrawal", function () {
    let token: Contract, staking: Contract;
    let owner: Signer, staker: Signer;

    beforeEach(async function () {
      [token, staking] = await loadFixture(deployFixture);
      const signers = await ethers.getSigners();
      owner = signers[0];
      staker = signers[1];
    });

    describe("Success", function () {
      let initialStake: BigInt;

      beforeEach(async function () {
        initialStake = ethers.parseEther("1000");
        await token.transfer(staker.address, initialStake);
        await token.connect(staker).approve(staking.target, initialStake);
        await staking.connect(staker).stake(initialStake);
      });

      it("Should reduce totalStaked", async function () {
        await staking.connect(staker).withdraw();
        expect(await staking.totalStaked()).to.eq(0);
      });

      it("Should reduce total rewards available", async function () {
        await staking.connect(staker).withdraw();
        expect(await staking.rewardBalance()).to.eq(
          initialRewards - BigInt(10 ** 18) / BigInt(14400)
        );
      });

      describe("After 1 day of staking", function () {
        let reward = ethers.parseEther("1");

        beforeEach(async function () {
          mine(14400 - 1); //as each operation already mines 1 block
          await staking.connect(staker).withdraw();
        });

        it("Should reduce balance of owner by 1", async function () {
          expect(await token.balanceOf(staking)).to.eq(initialRewards - reward);
        });

        it("Should increase balance of staker by 1", async function () {
          expect(await token.balanceOf(staker)).to.eq(initialStake + reward);
        });
      });
    });

    describe("Failures", function () {
      it("Should'nt be able to withdraw when not staking", async function () {
        await expect(staking.connect(staker).withdraw()).to.be.revertedWith(
          "No stakes available"
        );
      });
    });
  });
});
