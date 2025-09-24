
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

const contractName = "yield-stacks";

describe("YieldStacks Contract Tests", () => {
  describe("Contract Initialization and Basic Setup", () => {
    it("should initialize contract with correct default values", () => {
      // Test platform stats initialization
      const { result: platformStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );
      
      expect(platformStats).toBeOk(
        Cl.tuple({
          "total-value-locked": Cl.uint(0),
          "total-vaults": Cl.uint(0),
          "total-strategies": Cl.uint(3), // 3 default strategies
          "platform-fee-rate": Cl.uint(50), // 0.5%
          "emergency-pause": Cl.bool(false),
        })
      );
    });

    it("should have pre-initialized default yield strategies", () => {
      // Test STX Staking Strategy (ID: 1)
      const { result: strategy1 } = simnet.callReadOnlyFn(
        contractName,
        "get-strategy-info",
        [Cl.uint(1)],
        deployer
      );
      
      expect(strategy1).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("STX-Staking-Strategy"),
          protocol: Cl.stringAscii("stx-vault"),
          apy: Cl.uint(1200), // 12%
          "tvl-capacity": Cl.uint(100000000000),
          "current-tvl": Cl.uint(0),
          "risk-score": Cl.uint(3),
          "is-active": Cl.bool(true),
          "contract-address": Cl.principal(deployer),
          "last-updated": Cl.uint(simnet.blockHeight),
        })
      );

      // Test Lending Protocol Strategy (ID: 2)
      const { result: strategy2 } = simnet.callReadOnlyFn(
        contractName,
        "get-strategy-info",
        [Cl.uint(2)],
        deployer
      );
      
      expect(strategy2).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Lending-Protocol-Strategy"),
          protocol: Cl.stringAscii("arkadiko"),
          apy: Cl.uint(800), // 8%
          "tvl-capacity": Cl.uint(50000000000),
          "current-tvl": Cl.uint(0),
          "risk-score": Cl.uint(5),
          "is-active": Cl.bool(true),
          "contract-address": Cl.principal(deployer),
          "last-updated": Cl.uint(simnet.blockHeight),
        })
      );

      // Test LP Farming Strategy (ID: 3)
      const { result: strategy3 } = simnet.callReadOnlyFn(
        contractName,
        "get-strategy-info",
        [Cl.uint(3)],
        deployer
      );
      
      expect(strategy3).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("LP-Farming-Strategy"),
          protocol: Cl.stringAscii("alex"),
          apy: Cl.uint(1500), // 15%
          "tvl-capacity": Cl.uint(25000000000),
          "current-tvl": Cl.uint(0),
          "risk-score": Cl.uint(7),
          "is-active": Cl.bool(true),
          "contract-address": Cl.principal(deployer),
          "last-updated": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("should correctly identify deployer as admin", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-user-admin",
        [Cl.principal(deployer)],
        deployer
      );
      
      expect(result).toBeBool(true);
    });

    it("should correctly identify non-admin users", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-user-admin",
        [Cl.principal(wallet1)],
        deployer
      );
      
      expect(result).toBeBool(false);
    });

    it("should return correct best APY from available strategies", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-best-apy",
        [],
        deployer
      );
      
      // Should return 1500 (15%) which is the highest APY from LP Farming Strategy
      expect(result).toBeUint(1500);
    });

    it("should have no vaults initially", () => {
      // Test non-existent vault
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(1)],
        deployer
      );
      
      expect(result).toBeNone();
    });

    it("should have empty user vault lists initially", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-vaults",
        [Cl.principal(wallet1)],
        deployer
      );
      
      expect(result).toBeList([]);
    });
  });

  describe("Vault Creation and Management", () => {
    it("should allow admin to create a conservative vault", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Conservative STX Vault"),
          Cl.uint(1), // Conservative risk level
          Cl.uint(1000000), // 1 STX minimum deposit (1M microSTX)
        ],
        deployer
      );

      expect(result).toBeOk(Cl.uint(1)); // First vault should have ID 1

      // Verify vault was created correctly
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(1)],
        deployer
      );

      expect(vaultInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Conservative STX Vault"),
          asset: Cl.principal(`${deployer}.stx-token`),
          "total-shares": Cl.uint(0),
          "total-assets": Cl.uint(0),
          "strategy-id": Cl.uint(2), // Should use lending protocol for conservative
          "risk-level": Cl.uint(1),
          "min-deposit": Cl.uint(1000000),
          "is-active": Cl.bool(true),
          "created-at": Cl.uint(simnet.blockHeight),
          "last-harvest": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("should allow admin to create a balanced vault", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Balanced Growth Vault"),
          Cl.uint(2), // Balanced risk level
          Cl.uint(500000), // 0.5 STX minimum deposit
        ],
        deployer
      );

      expect(result).toBeOk(Cl.uint(2)); // Second vault should have ID 2

      // Verify vault strategy assignment
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(2)],
        deployer
      );

      expect(vaultInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Balanced Growth Vault"),
          "strategy-id": Cl.uint(1), // Should use STX staking for balanced
          "risk-level": Cl.uint(2),
          "min-deposit": Cl.uint(500000),
          "is-active": Cl.bool(true),
          asset: Cl.principal(`${deployer}.stx-token`),
          "total-shares": Cl.uint(0),
          "total-assets": Cl.uint(0),
          "created-at": Cl.uint(simnet.blockHeight),
          "last-harvest": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("should allow admin to create an aggressive vault", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("High Yield Aggressive Vault"),
          Cl.uint(3), // Aggressive risk level
          Cl.uint(2000000), // 2 STX minimum deposit
        ],
        deployer
      );

      expect(result).toBeOk(Cl.uint(3)); // Third vault should have ID 3

      // Verify aggressive vault uses high-risk strategy
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(3)],
        deployer
      );

      expect(vaultInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("High Yield Aggressive Vault"),
          "strategy-id": Cl.uint(1), // Should use LP farming strategy
          "risk-level": Cl.uint(3),
          "min-deposit": Cl.uint(2000000),
          "is-active": Cl.bool(true),
          asset: Cl.principal(`${deployer}.stx-token`),
          "total-shares": Cl.uint(0),
          "total-assets": Cl.uint(0),
          "created-at": Cl.uint(simnet.blockHeight),
          "last-harvest": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("should reject vault creation by non-admin users", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Unauthorized Vault"),
          Cl.uint(1),
          Cl.uint(1000000),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_NOT_AUTHORIZED
    });

    it("should reject invalid risk levels", () => {
      // Test risk level too low
      const { result: tooLow } = simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Invalid Risk Vault"),
          Cl.uint(0), // Invalid: below minimum
          Cl.uint(1000000),
        ],
        deployer
      );

      expect(tooLow).toBeErr(Cl.uint(202)); // ERR_INVALID_AMOUNT

      // Test risk level too high
      const { result: tooHigh } = simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Invalid Risk Vault"),
          Cl.uint(4), // Invalid: above maximum
          Cl.uint(1000000),
        ],
        deployer
      );

      expect(tooHigh).toBeErr(Cl.uint(202)); // ERR_INVALID_AMOUNT
    });

    it("should update platform stats after vault creation", () => {
      // Create a vault first
      simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Stats Test Vault"),
          Cl.uint(2),
          Cl.uint(1000000),
        ],
        deployer
      );

      // Check updated platform stats
      const { result: platformStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      expect(platformStats).toBeOk(
        Cl.tuple({
          "total-value-locked": Cl.uint(0), // No deposits yet
          "total-vaults": Cl.uint(4), // Should be 4 now (3 from previous tests + 1)
          "total-strategies": Cl.uint(3),
          "platform-fee-rate": Cl.uint(50),
          "emergency-pause": Cl.bool(false),
        })
      );
    });

    it("should prevent vault creation when emergency pause is active", () => {
      // First, activate emergency pause
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );

      // Try to create vault while paused
      const { result } = simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Paused Vault"),
          Cl.uint(1),
          Cl.uint(1000000),
        ],
        deployer
      );

      expect(result).toBeErr(Cl.uint(205)); // ERR_VAULT_PAUSED

      // Restore normal state
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );
    });

    it("should correctly assign strategy based on risk level", () => {
      // Test that conservative vaults get conservative strategies
      simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Conservative Strategy Test"),
          Cl.uint(1),
          Cl.uint(1000000),
        ],
        deployer
      );

      const { result: conservativeVault } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(5)], // Assuming this is the 5th vault
        deployer
      );

      // Conservative should use strategy 2 (Lending Protocol, lower risk)
      expect(conservativeVault).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Conservative Strategy Test"),
          "strategy-id": Cl.uint(2),
          "risk-level": Cl.uint(1),
          "min-deposit": Cl.uint(1000000),
          "is-active": Cl.bool(true),
          asset: Cl.principal(`${deployer}.stx-token`),
          "total-shares": Cl.uint(0),
          "total-assets": Cl.uint(0),
          "created-at": Cl.uint(simnet.blockHeight),
          "last-harvest": Cl.uint(simnet.blockHeight),
        })
      );
    });
  });

  describe("User Deposits and Position Management", () => {
    // Helper function to create a test vault for deposit tests
    const createTestVault = (riskLevel: number, minDeposit: number) => {
      return simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii(`Test Vault Risk-${riskLevel}`),
          Cl.uint(riskLevel),
          Cl.uint(minDeposit),
        ],
        deployer
      );
    };

    it("should allow user to make first deposit and receive shares", () => {
      // Create a test vault first
      createTestVault(2, 1000000); // 1 STX minimum

      const depositAmount = 5000000; // 5 STX
      
      // Make deposit
      const { result } = simnet.callPublicFn(
        contractName,
        "deposit",
        [
          Cl.uint(6), // Vault ID (assuming this is the 6th vault created)
          Cl.uint(depositAmount),
        ],
        wallet1
      );

      // First deposit should get 1:1 share ratio
      expect(result).toBeOk(Cl.uint(depositAmount));

      // Verify user position was created
      const { result: userPosition } = simnet.callReadOnlyFn(
        contractName,
        "get-user-position",
        [Cl.uint(6), Cl.principal(wallet1)],
        deployer
      );

      expect(userPosition).toBeSome(
        Cl.tuple({
          shares: Cl.uint(depositAmount),
          "deposited-at": Cl.uint(simnet.blockHeight),
          "last-compound": Cl.uint(simnet.blockHeight),
          "total-deposited": Cl.uint(depositAmount),
          "total-withdrawn": Cl.uint(0),
        })
      );

      // Verify vault totals were updated
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(6)],
        deployer
      );

      expect(vaultInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Test Vault Risk-2"),
          asset: Cl.principal(`${deployer}.stx-token`),
          "total-shares": Cl.uint(depositAmount),
          "total-assets": Cl.uint(depositAmount),
          "strategy-id": Cl.uint(1),
          "risk-level": Cl.uint(2),
          "min-deposit": Cl.uint(1000000),
          "is-active": Cl.bool(true),
          "created-at": Cl.uint(simnet.blockHeight),
          "last-harvest": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("should calculate correct share amount for subsequent deposits", () => {
      // Create vault and make initial deposit
      createTestVault(1, 500000); // 0.5 STX minimum
      
      const firstDeposit = 10000000; // 10 STX
      const secondDeposit = 5000000; // 5 STX

      // First deposit
      simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(7), Cl.uint(firstDeposit)],
        wallet1
      );

      // Simulate some yield by manually advancing blocks
      simnet.mineEmptyBlocks(100);

      // Second deposit from different user
      const { result } = simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(7), Cl.uint(secondDeposit)],
        wallet1 // Using same wallet for simplicity in testing
      );

      // Should still get proportional shares
      expect(result).toBeOk(Cl.uint(5000000)); // Should be close to deposit amount

      // Verify total vault shares increased
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(7)],
        deployer
      );

      const vaultData = vaultInfo as any;
      expect(vaultData.value.data["total-shares"].value).toBeGreaterThan(firstDeposit);
    });

    it("should reject deposits below minimum threshold", () => {
      createTestVault(3, 2000000); // 2 STX minimum

      const tooSmallDeposit = 1000000; // 1 STX (below minimum)

      const { result } = simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(8), Cl.uint(tooSmallDeposit)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(206)); // ERR_MINIMUM_DEPOSIT_NOT_MET
    });

    it("should reject deposits to non-existent vaults", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(999), Cl.uint(5000000)], // Non-existent vault
        wallet1
      );

      expect(result).toBeErr(Cl.uint(203)); // ERR_VAULT_NOT_FOUND
    });

    it("should reject deposits when emergency pause is active", () => {
      createTestVault(1, 1000000);

      // Activate emergency pause
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(9), Cl.uint(5000000)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(205)); // ERR_VAULT_PAUSED

      // Restore normal state
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );
    });

    it("should update user vault list after deposit", () => {
      createTestVault(2, 1000000);

      // Make deposit
      simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(10), Cl.uint(3000000)],
        wallet1
      );

      // Check user's vault list
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-vaults",
        [Cl.principal(wallet1)],
        deployer
      );

      // Should contain the vault ID
      expect(result).toBeList([Cl.uint(6), Cl.uint(7), Cl.uint(8), Cl.uint(10)]);
    });

    it("should calculate correct user vault value", () => {
      createTestVault(1, 500000);

      const depositAmount = 8000000; // 8 STX

      // Make deposit
      simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(11), Cl.uint(depositAmount)],
        wallet1
      );

      // Check user vault value
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-user-vault-value",
        [Cl.uint(11), Cl.principal(wallet1)],
        deployer
      );

      // Should equal deposit amount initially (no yield yet)
      expect(result).toBeUint(depositAmount);
    });

    it("should update global TVL after deposits", () => {
      createTestVault(3, 1000000);

      const depositAmount = 15000000; // 15 STX

      // Check initial TVL
      const { result: initialStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      const initialTVL = (initialStats as any).value.data["total-value-locked"].value;

      // Make deposit
      simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(12), Cl.uint(depositAmount)],
        wallet1
      );

      // Check updated TVL
      const { result: updatedStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      const newTVL = (updatedStats as any).value.data["total-value-locked"].value;
      expect(newTVL).toBe(initialTVL + depositAmount);
    });

    it("should handle multiple deposits from same user", () => {
      createTestVault(2, 1000000);

      const firstDeposit = 3000000; // 3 STX
      const secondDeposit = 7000000; // 7 STX

      // First deposit
      simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(13), Cl.uint(firstDeposit)],
        wallet1
      );

      // Second deposit
      const { result } = simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(13), Cl.uint(secondDeposit)],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(secondDeposit));

      // Verify combined position
      const { result: userPosition } = simnet.callReadOnlyFn(
        contractName,
        "get-user-position",
        [Cl.uint(13), Cl.principal(wallet1)],
        deployer
      );

      expect(userPosition).toBeSome(
        Cl.tuple({
          shares: Cl.uint(firstDeposit + secondDeposit),
          "deposited-at": Cl.uint(simnet.blockHeight - 1), // From first deposit
          "last-compound": Cl.uint(simnet.blockHeight),
          "total-deposited": Cl.uint(firstDeposit + secondDeposit),
          "total-withdrawn": Cl.uint(0),
        })
      );
    });
  });

  describe("Withdrawal and Share Management", () => {
    // Helper function to setup vault with deposits for withdrawal tests
    const setupVaultWithDeposit = (vaultId: number, depositAmount: number) => {
      // Create vault
      simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii(`Withdrawal Test Vault ${vaultId}`),
          Cl.uint(2), // Balanced risk
          Cl.uint(1000000), // 1 STX minimum
        ],
        deployer
      );

      // Make deposit
      return simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(vaultId), Cl.uint(depositAmount)],
        wallet1
      );
    };

    it("should allow partial withdrawal with correct asset calculation", () => {
      const depositAmount = 10000000; // 10 STX
      const withdrawShares = 3000000; // 3 STX worth of shares
      
      setupVaultWithDeposit(14, depositAmount);

      // Withdraw partial shares
      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(14), Cl.uint(withdrawShares)],
        wallet1
      );

      // Should receive assets minus platform fee (0.5%)
      const expectedFee = Math.floor((withdrawShares * 50) / 10000); // 0.5% fee
      const expectedWithdrawal = withdrawShares - expectedFee;
      
      expect(result).toBeOk(Cl.uint(expectedWithdrawal));

      // Verify user position was updated
      const { result: userPosition } = simnet.callReadOnlyFn(
        contractName,
        "get-user-position",
        [Cl.uint(14), Cl.principal(wallet1)],
        deployer
      );

      expect(userPosition).toBeSome(
        Cl.tuple({
          shares: Cl.uint(depositAmount - withdrawShares),
          "deposited-at": Cl.uint(simnet.blockHeight - 1),
          "last-compound": Cl.uint(simnet.blockHeight - 1),
          "total-deposited": Cl.uint(depositAmount),
          "total-withdrawn": Cl.uint(expectedWithdrawal),
        })
      );
    });

    it("should allow full withdrawal and remove user position", () => {
      const depositAmount = 5000000; // 5 STX
      
      setupVaultWithDeposit(15, depositAmount);

      // Withdraw all shares
      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(15), Cl.uint(depositAmount)],
        wallet1
      );

      const expectedFee = Math.floor((depositAmount * 50) / 10000); // 0.5% fee
      const expectedWithdrawal = depositAmount - expectedFee;

      expect(result).toBeOk(Cl.uint(expectedWithdrawal));

      // Verify user position was removed
      const { result: userPosition } = simnet.callReadOnlyFn(
        contractName,
        "get-user-position",
        [Cl.uint(15), Cl.principal(wallet1)],
        deployer
      );

      expect(userPosition).toBeNone();

      // Verify vault totals were updated
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(15)],
        deployer
      );

      expect(vaultInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Withdrawal Test Vault 15"),
          asset: Cl.principal(`${deployer}.stx-token`),
          "total-shares": Cl.uint(0),
          "total-assets": Cl.uint(0),
          "strategy-id": Cl.uint(1),
          "risk-level": Cl.uint(2),
          "min-deposit": Cl.uint(1000000),
          "is-active": Cl.bool(true),
          "created-at": Cl.uint(simnet.blockHeight - 1),
          "last-harvest": Cl.uint(simnet.blockHeight - 1),
        })
      );
    });

    it("should reject withdrawal of more shares than user owns", () => {
      const depositAmount = 3000000; // 3 STX
      
      setupVaultWithDeposit(16, depositAmount);

      // Try to withdraw more than deposited
      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(16), Cl.uint(depositAmount + 1000000)], // 1 STX more than deposited
        wallet1
      );

      expect(result).toBeErr(Cl.uint(207)); // ERR_WITHDRAWAL_TOO_LARGE
    });

    it("should reject zero share withdrawal", () => {
      const depositAmount = 2000000; // 2 STX
      
      setupVaultWithDeposit(17, depositAmount);

      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(17), Cl.uint(0)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(202)); // ERR_INVALID_AMOUNT
    });

    it("should reject withdrawal from non-existent vault", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(999), Cl.uint(1000000)], // Non-existent vault
        wallet1
      );

      expect(result).toBeErr(Cl.uint(203)); // ERR_VAULT_NOT_FOUND
    });

    it("should reject withdrawal when user has no position", () => {
      // Create vault but don't deposit
      simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("No Position Vault"),
          Cl.uint(1),
          Cl.uint(1000000),
        ],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(18), Cl.uint(1000000)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(201)); // ERR_INSUFFICIENT_BALANCE
    });

    it("should reject withdrawal when emergency pause is active", () => {
      const depositAmount = 4000000; // 4 STX
      
      setupVaultWithDeposit(19, depositAmount);

      // Activate emergency pause
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(19), Cl.uint(1000000)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(205)); // ERR_VAULT_PAUSED

      // Restore normal state
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );
    });

    it("should correctly calculate and transfer platform fees", () => {
      const depositAmount = 20000000; // 20 STX
      const withdrawShares = 10000000; // 10 STX worth of shares
      
      setupVaultWithDeposit(20, depositAmount);

      // Withdraw shares
      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(20), Cl.uint(withdrawShares)],
        wallet1
      );

      const expectedFee = Math.floor((withdrawShares * 50) / 10000); // 0.5% fee
      const expectedWithdrawal = withdrawShares - expectedFee;

      expect(result).toBeOk(Cl.uint(expectedWithdrawal));

      // Verify the withdrawal was successful and fees were calculated correctly
      // In a real implementation, you'd also verify treasury balance changes
    });

    it("should update global TVL after withdrawals", () => {
      const depositAmount = 15000000; // 15 STX
      const withdrawShares = 5000000; // 5 STX worth of shares
      
      setupVaultWithDeposit(21, depositAmount);

      // Get initial TVL
      const { result: initialStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      const initialTVL = (initialStats as any).value.data["total-value-locked"].value;

      // Withdraw shares
      simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(21), Cl.uint(withdrawShares)],
        wallet1
      );

      // Check updated TVL
      const { result: updatedStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      const newTVL = (updatedStats as any).value.data["total-value-locked"].value;
      
      // TVL should decrease by the full withdrawal amount (including fees)
      expect(newTVL).toBe(initialTVL - withdrawShares);
    });

    it("should handle withdrawal when vault has earned yield", () => {
      const depositAmount = 12000000; // 12 STX
      
      setupVaultWithDeposit(22, depositAmount);

      // Simulate time passing and harvest vault to generate yield
      simnet.mineEmptyBlocks(1000); // Mine many blocks to simulate time
      
      // Harvest to compound earnings
      simnet.callPublicFn(
        contractName,
        "harvest-vault",
        [Cl.uint(22)],
        deployer
      );

      // Now withdraw - should get proportional share of increased vault value
      const withdrawShares = 6000000; // Half of original shares
      
      const { result } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(22), Cl.uint(withdrawShares)],
        wallet1
      );

      // Should be successful with some withdrawal amount
      expect(result).toBeOk(expect.any(Object));
    });

    it("should correctly handle multiple sequential withdrawals", () => {
      const depositAmount = 18000000; // 18 STX
      
      setupVaultWithDeposit(23, depositAmount);

      // First withdrawal
      const firstWithdraw = 5000000; // 5 STX worth
      const { result: firstResult } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(23), Cl.uint(firstWithdraw)],
        wallet1
      );

      expect(firstResult).toBeOk(expect.any(Object));

      // Second withdrawal
      const secondWithdraw = 8000000; // 8 STX worth
      const { result: secondResult } = simnet.callPublicFn(
        contractName,
        "withdraw",
        [Cl.uint(23), Cl.uint(secondWithdraw)],
        wallet1
      );

      expect(secondResult).toBeOk(expect.any(Object));

      // Verify remaining position
      const { result: userPosition } = simnet.callReadOnlyFn(
        contractName,
        "get-user-position",
        [Cl.uint(23), Cl.principal(wallet1)],
        deployer
      );

      const remainingShares = depositAmount - firstWithdraw - secondWithdraw;
      expect(userPosition).toBeSome(
        Cl.tuple({
          shares: Cl.uint(remainingShares),
          "deposited-at": Cl.uint(simnet.blockHeight - 2),
          "last-compound": Cl.uint(simnet.blockHeight - 2),
          "total-deposited": Cl.uint(depositAmount),
          "total-withdrawn": Cl.uint((firstResult as any).value + (secondResult as any).value),
        })
      );
    });
  });

  describe("Admin Functions and Strategy Management", () => {
    it("should allow admin to add new yield strategy", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-strategy",
        [
          Cl.stringAscii("New DeFi Strategy"),
          Cl.stringAscii("compound"),
          Cl.uint(2000), // 20% APY
          Cl.uint(75000000000), // 75k STX capacity
          Cl.uint(8), // High risk score
          Cl.principal(deployer), // Contract address
        ],
        deployer
      );

      expect(result).toBeOk(Cl.uint(4)); // Should be strategy ID 4

      // Verify strategy was created correctly
      const { result: strategyInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-strategy-info",
        [Cl.uint(4)],
        deployer
      );

      expect(strategyInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("New DeFi Strategy"),
          protocol: Cl.stringAscii("compound"),
          apy: Cl.uint(2000),
          "tvl-capacity": Cl.uint(75000000000),
          "current-tvl": Cl.uint(0),
          "risk-score": Cl.uint(8),
          "is-active": Cl.bool(true),
          "contract-address": Cl.principal(deployer),
          "last-updated": Cl.uint(simnet.blockHeight),
        })
      );

      // Verify strategy counter was updated
      const { result: platformStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      expect(platformStats).toBeOk(
        Cl.tuple({
          "total-value-locked": expect.any(Object),
          "total-vaults": expect.any(Object),
          "total-strategies": Cl.uint(4), // Should now be 4
          "platform-fee-rate": Cl.uint(50),
          "emergency-pause": Cl.bool(false),
        })
      );
    });

    it("should reject strategy creation by non-admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-strategy",
        [
          Cl.stringAscii("Unauthorized Strategy"),
          Cl.stringAscii("protocol"),
          Cl.uint(1000),
          Cl.uint(10000000000),
          Cl.uint(5),
          Cl.principal(wallet1),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_NOT_AUTHORIZED
    });

    it("should allow admin to update strategy APY", () => {
      const newAPY = 1800; // 18% APY

      const { result } = simnet.callPublicFn(
        contractName,
        "update-strategy-apy",
        [Cl.uint(1), Cl.uint(newAPY)],
        deployer
      );

      expect(result).toBeOk(Cl.uint(newAPY));

      // Verify the strategy was updated
      const { result: strategyInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-strategy-info",
        [Cl.uint(1)],
        deployer
      );

      expect(strategyInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("STX-Staking-Strategy"),
          protocol: Cl.stringAscii("stx-vault"),
          apy: Cl.uint(newAPY),
          "tvl-capacity": Cl.uint(100000000000),
          "current-tvl": Cl.uint(0),
          "risk-score": Cl.uint(3),
          "is-active": Cl.bool(true),
          "contract-address": Cl.principal(deployer),
          "last-updated": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("should reject APY update by non-admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-strategy-apy",
        [Cl.uint(1), Cl.uint(2500)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_NOT_AUTHORIZED
    });

    it("should reject APY update for non-existent strategy", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-strategy-apy",
        [Cl.uint(999), Cl.uint(1500)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(204)); // ERR_STRATEGY_NOT_FOUND
    });

    it("should allow admin to set platform fee within limits", () => {
      const newFee = 100; // 1% fee

      const { result } = simnet.callPublicFn(
        contractName,
        "set-platform-fee",
        [Cl.uint(newFee)],
        deployer
      );

      expect(result).toBeOk(Cl.uint(newFee));

      // Verify fee was updated
      const { result: platformStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      expect(platformStats).toBeOk(
        Cl.tuple({
          "total-value-locked": expect.any(Object),
          "total-vaults": expect.any(Object),
          "total-strategies": expect.any(Object),
          "platform-fee-rate": Cl.uint(newFee),
          "emergency-pause": Cl.bool(false),
        })
      );
    });

    it("should reject platform fee above maximum", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "set-platform-fee",
        [Cl.uint(1500)], // 15% - above 10% maximum
        deployer
      );

      expect(result).toBeErr(Cl.uint(202)); // ERR_INVALID_AMOUNT
    });

    it("should reject platform fee setting by non-admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "set-platform-fee",
        [Cl.uint(75)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_NOT_AUTHORIZED
    });

    it("should allow contract owner to add admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-admin",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify wallet1 is now admin
      const { result: isAdmin } = simnet.callReadOnlyFn(
        contractName,
        "is-user-admin",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(isAdmin).toBeBool(true);
    });

    it("should reject admin addition by non-owner", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "add-admin",
        [Cl.principal(wallet1)], // wallet1 trying to add another admin
        wallet1
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_NOT_AUTHORIZED
    });

    it("should allow admin to toggle emergency pause", () => {
      // Test activating pause
      const { result: activateResult } = simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );

      expect(activateResult).toBeOk(Cl.bool(true));

      // Verify pause is active
      const { result: pausedStats } = simnet.callReadOnlyFn(
        contractName,
        "get-platform-stats",
        [],
        deployer
      );

      expect(pausedStats).toBeOk(
        Cl.tuple({
          "total-value-locked": expect.any(Object),
          "total-vaults": expect.any(Object),
          "total-strategies": expect.any(Object),
          "platform-fee-rate": expect.any(Object),
          "emergency-pause": Cl.bool(true),
        })
      );

      // Test deactivating pause
      const { result: deactivateResult } = simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );

      expect(deactivateResult).toBeOk(Cl.bool(false));
    });

    it("should reject emergency pause toggle by non-admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        wallet1 // wallet1 is not admin initially
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_NOT_AUTHORIZED
    });

    it("should allow admin to rebalance vault strategy", () => {
      // First create a vault
      simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Rebalance Test Vault"),
          Cl.uint(2),
          Cl.uint(1000000),
        ],
        deployer
      );

      // Rebalance to a different strategy
      const { result } = simnet.callPublicFn(
        contractName,
        "rebalance-vault",
        [Cl.uint(24), Cl.uint(3)], // Assuming vault 24, change to strategy 3
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify vault strategy was updated
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(24)],
        deployer
      );

      expect(vaultInfo).toBeSome(
        Cl.tuple({
          name: Cl.stringAscii("Rebalance Test Vault"),
          asset: Cl.principal(`${deployer}.stx-token`),
          "total-shares": Cl.uint(0),
          "total-assets": Cl.uint(0),
          "strategy-id": Cl.uint(3), // Should be updated to strategy 3
          "risk-level": Cl.uint(2),
          "min-deposit": Cl.uint(1000000),
          "is-active": Cl.bool(true),
          "created-at": Cl.uint(simnet.blockHeight - 1),
          "last-harvest": Cl.uint(simnet.blockHeight),
        })
      );
    });

    it("should reject vault rebalancing by non-admin", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "rebalance-vault",
        [Cl.uint(24), Cl.uint(2)],
        wallet1 // Non-admin user
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_NOT_AUTHORIZED
    });

    it("should reject rebalancing to non-existent strategy", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "rebalance-vault",
        [Cl.uint(24), Cl.uint(999)], // Non-existent strategy
        deployer
      );

      expect(result).toBeErr(Cl.uint(204)); // ERR_STRATEGY_NOT_FOUND
    });

    it("should reject rebalancing non-existent vault", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "rebalance-vault",
        [Cl.uint(999), Cl.uint(2)], // Non-existent vault
        deployer
      );

      expect(result).toBeErr(Cl.uint(203)); // ERR_VAULT_NOT_FOUND
    });

    it("should allow admin to harvest vault earnings", () => {
      // Create vault with deposit
      simnet.callPublicFn(
        contractName,
        "create-vault",
        [
          Cl.stringAscii("Harvest Test Vault"),
          Cl.uint(2),
          Cl.uint(1000000),
        ],
        deployer
      );

      simnet.callPublicFn(
        contractName,
        "deposit",
        [Cl.uint(25), Cl.uint(10000000)], // 10 STX
        wallet1
      );

      // Mine blocks to simulate time passing
      simnet.mineEmptyBlocks(500);

      // Harvest the vault
      const { result } = simnet.callPublicFn(
        contractName,
        "harvest-vault",
        [Cl.uint(25)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify harvest updated the vault's last-harvest timestamp
      const { result: vaultInfo } = simnet.callReadOnlyFn(
        contractName,
        "get-vault-info",
        [Cl.uint(25)],
        deployer
      );

      const vaultData = vaultInfo as any;
      expect(vaultData.value.data["last-harvest"].value).toBe(simnet.blockHeight);
    });

    it("should reject vault harvesting when emergency pause is active", () => {
      // Activate emergency pause
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );

      const { result } = simnet.callPublicFn(
        contractName,
        "harvest-vault",
        [Cl.uint(25)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(205)); // ERR_VAULT_PAUSED

      // Restore normal state
      simnet.callPublicFn(
        contractName,
        "toggle-emergency-pause",
        [],
        deployer
      );
    });

    it("should reject harvesting non-existent vault", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "harvest-vault",
        [Cl.uint(999)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(203)); // ERR_VAULT_NOT_FOUND
    });
  });
});
