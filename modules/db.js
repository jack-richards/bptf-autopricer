const pgpLib = require("pg-promise");

function createDb(config) {
  const pgp = pgpLib({ schema: config.database.schema });
  const cn = {
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
  };
  const db = pgp(cn);
  const cs = new pgp.helpers.ColumnSet(
    ["name", "sku", "currencies", "intent", "updated", "steamid"],
    {
      table: "listings",
    },
  );
  return { db, pgp, cs };
}

module.exports = createDb;
