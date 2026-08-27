import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-written (not generated via `make migration-generate`, which would
// not produce the readable CHECK constraint names used here) — same style
// as CreateRefreshTokens. Review before running `make migration-run`.
export class CreateWallets1787786250897 implements MigrationInterface {
  name = 'CreateWallets1787786250897';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "wallets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "balance" numeric(14,2) NOT NULL DEFAULT '0.00', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_wallets_user_id" UNIQUE ("user_id"), CONSTRAINT "PK_wallets_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "wallet_transactions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "type" character varying(20) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'completed', "amount" numeric(14,2) NOT NULL, "from_wallet_id" uuid, "to_wallet_id" uuid, "initiated_by_user_id" uuid NOT NULL, "reversal_of_transaction_id" uuid, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "CHK_wallet_transactions_type" CHECK ("type" IN ('deposit','transfer','reversal')), CONSTRAINT "CHK_wallet_transactions_status" CHECK ("status" IN ('completed','reversed')), CONSTRAINT "CHK_wallet_transactions_amount_positive" CHECK ("amount" > 0), CONSTRAINT "UQ_wallet_transactions_reversal_of_transaction_id" UNIQUE ("reversal_of_transaction_id"), CONSTRAINT "PK_wallet_transactions_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_from_wallet_id" ON "wallet_transactions" ("from_wallet_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_to_wallet_id" ON "wallet_transactions" ("to_wallet_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_initiated_by_user_id" ON "wallet_transactions" ("initiated_by_user_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "FK_wallets_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_wallet_transactions_from_wallet_id" FOREIGN KEY ("from_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_wallet_transactions_to_wallet_id" FOREIGN KEY ("to_wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_wallet_transactions_initiated_by_user_id" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD CONSTRAINT "FK_wallet_transactions_reversal_of_transaction_id" FOREIGN KEY ("reversal_of_transaction_id") REFERENCES "wallet_transactions"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_wallet_transactions_reversal_of_transaction_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_wallet_transactions_initiated_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_wallet_transactions_to_wallet_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP CONSTRAINT "FK_wallet_transactions_from_wallet_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "FK_wallets_user_id"`,
    );

    await queryRunner.query(
      `DROP INDEX "public"."IDX_wallet_transactions_initiated_by_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_wallet_transactions_to_wallet_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_wallet_transactions_from_wallet_id"`,
    );

    await queryRunner.query(`DROP TABLE "wallet_transactions"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
  }
}
