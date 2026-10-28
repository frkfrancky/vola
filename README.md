# Vola — les comptes entre colocs

Chaque membre importe son relevé CSV Revolut, indique pour chaque achat s'il concerne
**lui seul**, **toute la coloc** (par défaut) ou **certaines personnes**, et Vola calcule
qui doit combien à qui, avec le nombre minimal de virements.

- **Next.js 16** (App Router, Server Actions) + **Tailwind CSS 4**
- **Postgres sur Neon** (offre gratuite) via **Drizzle ORM**
- Auth e-mail / mot de passe (bcrypt + cookie JWT signé)

## Fonctionnement

| Notion | Description |
| --- | --- |
| Compte partagé | Un groupe de personnes qui vivent ensemble. On peut en avoir plusieurs, et on y invite ses colocs avec un code ou un lien. |
| Dépense | Importée depuis Revolut ou saisie à la main. Seul celui qui l'a payée peut la modifier. |
| Personnes concernées | La dépense est divisée à parts égales entre elles. « Moi seul » = n'entre pas dans les comptes. |
| Remboursement | « Marquer comme remboursé » enregistre un virement et remet le solde à jour. |
| Période | Les comptes se font par période (semaine, mois, plusieurs mois… au choix). Clôturer une période fige ses dépenses et donne son propre bilan ; les dépenses suivantes partent dans la période en cours. La dernière période clôturée peut être rouverte. |

Import Revolut : seules les sorties d'argent non annulées sont gardées. Les paiements par carte
sont pré-cochés, les virements, retraits et opérations de change sont décochés. Ré-importer un
relevé qui recoupe le précédent n'ajoute pas de doublons.

## Développement local

1. Crée une base gratuite sur [neon.tech](https://neon.tech) et copie la chaîne de connexion.
2. Copie `.env.example` en `.env.local` et remplis `DATABASE_URL` et `SESSION_SECRET` :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
3. Crée les tables puis lance l'app :
   ```bash
   npm install
   npm run db:push
   npm run dev
   ```

## E-mails (mot de passe oublié)

Les liens de réinitialisation sont envoyés via Gmail (gratuit, ~500 e-mails/jour) :

1. Active la validation en 2 étapes sur ton compte Google.
2. Crée un mot de passe d'application sur <https://myaccount.google.com/apppasswords>.
3. Renseigne `SMTP_USER` (ton adresse Gmail) et `SMTP_PASS` (le mot de passe d'application),
   en local et sur Vercel.

En local, sans ces variables, le lien s'affiche dans le terminal de `npm run dev`.

## Déploiement sur Vercel

1. Pousse le projet sur GitHub, puis importe-le dans Vercel.
2. Dans le projet Vercel : **Storage → Create Database → Neon** (gratuit). `DATABASE_URL` est
   ajoutée automatiquement aux variables d'environnement.
3. Ajoute `SESSION_SECRET`, `SMTP_USER` et `SMTP_PASS` dans les variables d'environnement.
4. Crée les tables dans cette base (une fois, et à chaque modification de `src/db/schema.ts`) :
   ```bash
   npx vercel env pull .env.local
   npm run db:push
   ```
5. Redéploie.

## Scripts

- `npm run dev`: serveur de développement
- `npm run build`: build de production
- `npm run db:push`: synchronise le schéma avec la base
- `npm run db:studio`: interface web pour explorer la base
