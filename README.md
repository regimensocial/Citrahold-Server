# Citrahold-Server
Citrahold-Server is the back-end for [Citrahold-Web](https://github.com/regimensocial/Citrahold-Web), [Citrahold-3DS](https://github.com/regimensocial/Citrahold-3DS), and [Citrahold-PC](https://github.com/regimensocial/citraholdUI/).

It's written in JavaScript with Node.js and Express.js because this was the simplest way to do it and keep it portable.

**If you are planning on just using Citrahold, you can ignore this repo. You just need [Citrahold-3DS](https://github.com/regimensocial/Citrahold-3DS) and [Citrahold-PC](https://github.com/regimensocial/citraholdUI/)!**

I wish I wrote this in TypeScript...


## Setup
1. `git clone https://github.com/regimensocial/Citrahold-Server.git`
2. `cd Citrahold-Server`
3. `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout selfsigned.key -out selfsigned.crt`
4. `npm i`
5. `node index.js`
