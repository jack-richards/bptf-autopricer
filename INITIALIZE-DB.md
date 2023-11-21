# Initialize the Database.
If you want to use the default database settings as provided in the config.json file, follow these steps to set up the database as required by the application:

1. Download Postgres and make sure it's service is enabled and running.
2. Use psql to login as the 'postgres' user.
3. Type CREATE DATABASE "bptf-autopricer"; and hit enter.
4. Type \c "bptf-autopricer" and hit enter
5. Type \i path/to/initalize-db.sql and hit enter
6. The database should now be ready for the application to use.
