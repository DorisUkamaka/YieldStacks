
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
});
