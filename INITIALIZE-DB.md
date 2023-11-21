# Initialize the Database.
If you want to use the default database settings as provided in the config.json file, follow these steps to set up the database as required by the application:

1. Download Postgres and make sure it's service is enabled and running.
2. Use psql to login as the 'postgres' user.
   - If it asks for a password, make sure you note it down as you will need to set the password in `config.json` once you are done here.
4. Type CREATE DATABASE "bptf-autopricer"; and hit enter.
5. Type \c "bptf-autopricer" and hit enter
6. Type \i path/to/initalize-db.sql and hit enter
7. The database should now be ready for the application to use.
