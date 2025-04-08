# Initializing the Database.
If you want to use the default database settings as provided in the config.json file, follow these steps to set up the database as required by the application:

1. Download Postgres and make sure its service is enabled and running.
2. Use psql to login as the 'postgres' user.
   - If it asks for a password, make sure you note it down as you will need to set the password in `config.json` once you are done here.
   - If no password was required, then you likely need to create one for this user, use the following command in the open psql session:
   - \password postgres and enter a new password when prompted.
3. To set up the auto-pricer to be used alongside my [**tf2-trading-bot** project](https://github.com/jack-richards/tf2-trading-bot), run the following command:
      - `CREATE DATABASE "trading_bot";`
   - Then change the database ["name" field in the config](https://github.com/jack-richards/bptf-autopricer/blob/tf2-trading-bot/config.json#L9) to "trading_bot".
6. Type \c "trading_bot" and hit enter
7. Type \i path/to/initialize-db.sql and hit enter
   - The path/to/ is a placeholder; it should be replaced with the full path to the initialize-db.sql file.
8. The database should now be ready for the tf2-trading-bot application to use.

A common issue faced when following these steps on Linux is having `initialize-db.sql` inside a protected directory, like /home or one of its sub-directories, preventing the Postgres user from being able to access the file. To remedy this, move the `initialize-db.sql` file to a directory without protection, like `/tmp`, this should allow psql to read the file as intended.
