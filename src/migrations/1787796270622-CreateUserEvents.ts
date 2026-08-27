import { MigrationInterface, QueryRunner } from 'typeorm';

// Hand-written, same style as CreateWallets — review before running
// `make migration-run`.
export class CreateUserEvents1787796270622 implements MigrationInterface {
  name = 'CreateUserEvents1787796270622';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid, "event_type" character varying(100) NOT NULL, "metadata" jsonb, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_user_events_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_user_events_user_id" ON "user_events" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_events_event_type" ON "user_events" ("event_type")`,
    );

    // ON DELETE SET NULL — an audit trail should outlive the user it
    // refers to, not disappear or block their deletion.
    await queryRunner.query(
      `ALTER TABLE "user_events" ADD CONSTRAINT "FK_user_events_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_events" DROP CONSTRAINT "FK_user_events_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_user_events_event_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_events_user_id"`);
    await queryRunner.query(`DROP TABLE "user_events"`);
  }
}
