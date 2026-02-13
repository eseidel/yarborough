Add a natural bidding system that can make sensible calls in auctions based on the HCP and length known in the caller's hand and based on inferring information about the partner's hand based on their previous calls. We will need to construct a model of the partner's holdings based on their previous calls in the auction. The natural bidding system should be able to generate many of the explicit SAYC conventional calls, although SAYC sometimes adjusts the natural calls with more specific bids.

Roughly, the following HCP point values (combined with partner) are needed to make a sound suited bid at the given level:

- 1 level: 16 HCP
- 2 level: 19 HCP
- 3 level: 22 HCP
- 4 level: 25 HCP
- 5 level: 28 HCP
- 6 level: 33 HCP
- 7 level: 37 HCP

We also need a length (combined with partner) of 8 cards in a suit to make a sound suited bid.

Similarly, the following HCP point values (combined with partner) are needed to make a sound notrump bid at the given level:

- 1 level: 19 HCP
- 2 level: 22 HCP
- 3 level: 25 HCP
- 4 level: 28 HCP
- 5 level: 30 HCP
- 6 level: 33 HCP
- 7 level: 37 HCP

In terms of priority:

- We prefer bidding slams to bidding games.
- We prefer bidding games to bidding part scores.
- We prefer bidding major games to bidding minor games.
- We prefer bidding notump games to bidding minor games.
- With stoppers, we prefer bidding notrump games to bidding major games.
- Without stoppers, we prefer bidding major games to bidding notrump games.
- We prefer bidding notrump slams to bidding suited slams.
- If our partnership is already winning the auction with game in a strain, there is usually no reason to make a natural bid at a higher level in that strain unless that bid is a slam.

if partner has a genuine bid in a suit (i.e., a bid that shows length in that suit), we can generally assume that partner has a stopper in that suit. By contrast, we wouldn't assume that partner has length in a suit if partner bid that suit as part of an artificial convention.

We can also bid a suited contract at a given level based only on the known length, combined with partner, using the Law of Total Tricks. In this kind of bid, we add our length in the suit to partner's known length in that suit and subtract 6 to determine the level at which we can bid that suit. The priority preferences above still apply to these bids.

Create a new directory for natural bidding. Put the sound bids in one YAML file in this directory. Put the law of total tricks bids in another YAML file in this directory.
