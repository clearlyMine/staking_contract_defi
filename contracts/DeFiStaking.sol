// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// import "hardhat/console.sol";

contract DeFiStaking is Ownable {
    using SafeERC20 for IERC20;

    mapping(address => uint256[]) stakes;
    mapping(address => uint256[]) stakeStartBlock;
    uint256 public totalStaked;

    IERC20 public immutable token;

    constructor(IERC20 _token) Ownable(msg.sender) {
        token = _token;
    }

    function rewardBalance() external view returns (uint256) {
        return token.balanceOf(address(this)) - totalStaked;
    }

    uint8 decimals = 18;

    function stake(uint256 _amount) external {
        require(_amount > 0, "amount cannot be zero");
        token.safeTransferFrom(msg.sender, address(this), _amount);
        totalStaked += _amount;
        stakes[msg.sender].push(_amount);
        stakeStartBlock[msg.sender].push(block.number);
    }

    function withdraw() external {
        require(
            stakes[msg.sender].length > 0 &&
                stakeStartBlock[msg.sender].length > 0,
            "No stakes available"
        );

        uint256 staked = _getTotalStaked(msg.sender);
        uint256 rewards = _getRewards(msg.sender);

        uint256 _total = staked + rewards;
        delete stakes[msg.sender];
        delete stakeStartBlock[msg.sender];
        totalStaked -= staked;
        token.safeTransfer(msg.sender, _total);
    }

    function getTotalStaked(address adr) external view returns (uint256) {
        return _getTotalStaked(adr);
    }

    function _getTotalStaked(address adr) internal view returns (uint256) {
        uint256 _staked = 0;
        uint256[] memory _stakes = stakes[adr];
        for (uint8 i = 0; i < _stakes.length; ++i) {
            _staked += _stakes[i];
        }
        return _staked;
    }

    function getTotal(address adr) external view returns (uint256) {
        return _getTotal(adr);
    }

    function _getTotal(address adr) internal view returns (uint256) {
        return _getTotalStaked(adr) + _getRewards(adr);
    }

    function getRewards(address adr) external view returns (uint256) {
        return _getRewards(adr);
    }

    ///
    /// @dev block times are assumed to be 6 sec as defined in the problem
    ///      which makes the reward to be (6/86_400)*(1/1_000) or 1/14_400_000
    ///
    function _getRewards(address adr) internal view returns (uint256) {
        if (stakes[adr].length == 0 || stakeStartBlock[adr].length == 0) {
            return 0;
        }
        uint256 rewards = 0;
        uint256 _currentBlock = block.number;
        uint256[] memory _stakes = stakes[adr];
        uint256[] memory startBlocks = stakeStartBlock[adr];
        for (uint256 i = 0; i < _stakes.length; ++i) {
            uint256 blockDifference = _currentBlock - startBlocks[i];
            if (blockDifference == 0) {
                continue;
            }
            rewards += ((blockDifference * _stakes[i]));
        }
        return rewards / 14_400_000;
    }
}
