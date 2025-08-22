
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
});
