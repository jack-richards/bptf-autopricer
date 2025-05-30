# Initializing the Database.
If you want to use the default database settings as provided in the config.json file, follow these steps to set up the database as required by the application:

1. Download Postgres and make sure its service is enabled and running.
2. Use psql to login as the 'postgres' user.
   - If it asks for a password, make sure you note it down as you will need to set the password in `config.json` once you are done here.
   - If no password was required, then you likely need to create one for this user, use the following command in the open psql session:
   - \password postgres and enter a new password when prompted.
4. Type CREATE DATABASE "bptf-autopricer"; and hit enter.
   - **!IMPORTANT!**: 
6. Type \c "name of the database you just created" and hit enter
7. Type \i path/to/initialize-db.sql and hit enter
   - The path/to/ is a placeholder; it should be replaced with the full path to the initialize-db.sql file.
8. The database should now be ready for the application to use.

A common issue faced when following these steps on Linux is having `initialize-db.sql` inside a protected directory, like /home or one of its sub-directories, preventing the Postgres user from being able to access the file. To remedy this, move the `initialize-db.sql` file to a directory without protection, like `/tmp`, this should allow psql to read the file as intended.
