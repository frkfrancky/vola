import {
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** Les sessions ouvertes avant cette date sont invalidées. */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Un "compte" partagé : un groupe de personnes qui vivent ensemble. */
export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  /** Empreinte SHA-256 du jeton envoyé par e-mail. */
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const memberships = pgTable(
  "memberships",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

/**
 * Un "compte" à faire sur une période : un mois, plusieurs mois, une semaine ou des
 * dates libres. Chaque dépense et chaque remboursement appartient à un compte.
 */
export const periods = pgTable(
  "periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Dates incluses, au format AAAA-MM-JJ. */
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("periods_household_idx").on(t.householdId, t.startDate)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    description: text("description").notNull(),
    /** Montant positif en centimes. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    source: text("source", { enum: ["revolut", "manual"] }).notNull(),
    /** Empreinte de la ligne CSV, pour ignorer les doublons à la ré-importation. */
    externalHash: text("external_hash"),
    periodId: uuid("period_id")
      .notNull()
      .references(() => periods.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_household_date_idx").on(t.householdId, t.date),
    uniqueIndex("expenses_household_hash_idx").on(t.householdId, t.externalHash),
  ],
);

/** Les personnes concernées par une dépense ; la dépense est divisée à parts égales entre elles. */
export const expenseShares = pgTable(
  "expense_shares",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.userId] })],
);

/** Un remboursement effectué d'un membre à un autre. */
export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("EUR"),
    periodId: uuid("period_id")
      .notNull()
      .references(() => periods.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("settlements_household_idx").on(t.householdId)],
);
