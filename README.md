# Asset Renting


## Description
The project is solana DAPP with elements of backend (for utility services like chats, push and so on)

The application will give an opportunity for loaner and landlord to safely agree on the asset renting where

1) Loaner deposits money (in form of solana/specific spl-token like USDT/USDC in solana)
2) Landlord gives an asset IRL 
3) Loaner uses it and after final usage proof that asset was used
  (or after some time, e.g. if it is house rent, after 2-3 days of living in the houuse if everything ok the loaner approves it)
4) after loaner approval the money is released to the landlord wallet

the functionality is:
1) Availability to post the asset on-chain
2) Availability to post the "agreement" of rent on-chain (with statuses and real document pdf saved on ipfs/other instances - is it possible to make it visible only for two parties not everywhere? maybe save encrypted with private keys)
3) Chat for communication (here we think about off-chain communication through centrifugo https://centrifugal.dev/)
- Here the on-chain abstraction should be created (e.g. the account should be created for each user in off-chain based on their solana wallet)
- Communication after will be done through backend
- the submission of the agreement through solana and will be listened through backend (in order to send push notification?)
4) Availability to log-in with solana wallet (link it with off-chain logic)

We should think about adapter for off/on chain communication

The frontend should support web3 (react js)
The backend mainly from golang
The on chain program on solana-rust