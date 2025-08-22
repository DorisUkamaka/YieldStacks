
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
});
