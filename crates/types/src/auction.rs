use crate::board::{Partnership, Position};
use crate::call::Call;
use crate::contract::{Contract, DoubleStatus};
use crate::strain::Strain;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Auction {
    pub dealer: Position,
    pub calls: Vec<Call>,
}

impl Auction {
    pub fn new(dealer: Position) -> Self {
        Self {
            dealer,
            calls: Vec::new(),
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (Position, &Call)> {
        let mut p = self.dealer;
        self.calls.iter().map(move |call| {
            let pos = p;
            p = p.next();
            (pos, call)
        })
    }

    /// Add a pre-parsed call. Use this for programmatic/untrusted input
    /// where you need to handle parse errors yourself.
    pub fn add_call(&mut self, call: Call) {
        self.calls.push(call);
    }

    /// Parse and add a single call from a string like "1C", "P", or "X".
    /// Panics on invalid input — use for tests and known-good data only.
    pub fn bid(&mut self, s: &str) {
        self.add_call(s.parse().expect("invalid call"));
    }

    /// Parse and add multiple space-separated calls like "P 1C P".
    /// Panics on invalid input — use for tests and known-good data only.
    pub fn bids(&mut self, s: &str) {
        for token in s.split_whitespace() {
            self.bid(token);
        }
    }

    /// Build an auction from space-separated calls like "P 1C P 2C".
    /// Panics on invalid input — use for tests and known-good data only.
    pub fn bidding(dealer: Position, calls: &str) -> Self {
        let mut auction = Self::new(dealer);
        for token in calls.split_whitespace() {
            auction.bid(token);
        }
        auction
    }

    pub fn current_partnership(&self) -> Partnership {
        self.current_player().partnership()
    }

    pub fn current_player(&self) -> Position {
        let mut p = self.dealer;
        for _ in 0..self.calls.len() {
            p = p.next();
        }
        p
    }

    pub fn current_seat(&self) -> u8 {
        (self.calls.len() as u8 + 1) % 4
    }

    pub fn current_contract(&self) -> Option<Contract> {
        let mut last_bid = None;
        let mut double_status = DoubleStatus::Undoubled;

        // Tracks the first player to have bid each strain for each side.
        // Index: 0 for North-South, 1 for East-West.
        // Strain index matches Strain::ALL order.
        let mut first_bidders = [[None; 5]; 2];

        for (position, call) in self.iter() {
            match call {
                Call::Bid { level, strain } => {
                    let partnership = position.partnership();
                    let side_index = partnership.idx();
                    let strain_index = strain.idx();

                    if first_bidders[side_index][strain_index].is_none() {
                        first_bidders[side_index][strain_index] = Some(position);
                    }

                    let declarer = first_bidders[side_index][strain_index].unwrap();
                    last_bid = Some((*level, *strain, declarer));
                    double_status = DoubleStatus::Undoubled;
                }
                Call::Double => {
                    double_status = DoubleStatus::Doubled;
                }
                Call::Redouble => {
                    double_status = DoubleStatus::Redoubled;
                }
                Call::Pass => {}
            }
        }

        last_bid.map(|(level, strain, declarer)| Contract {
            level,
            strain,
            double_status,
            declarer,
        })
    }

    pub fn is_finished(&self) -> bool {
        Self::is_finished_at(&self.calls, self.calls.len())
    }

    pub fn is_complete(&self) -> bool {
        self.is_finished()
    }

    pub fn is_open(&self) -> bool {
        self.calls.iter().any(|c| c.is_bid())
    }

    pub fn opener(&self) -> Option<Position> {
        self.iter()
            .find(|(_, call)| call.is_bid())
            .map(|(position, _)| position)
    }

    /// Returns the last bid (not pass/double/redouble) and who made it.
    pub fn last_bid(&self) -> Option<(Position, &Call)> {
        self.iter().filter(|(_, call)| call.is_bid()).last()
    }

    /// Returns the minimum legal bid for the given strain.
    pub fn minimum_bid_in(&self, strain: Strain) -> Option<Call> {
        if self.is_finished() {
            return None;
        }
        let Some((_, last_call)) = self.last_bid() else {
            return Some(Call::Bid { level: 1, strain });
        };
        match last_call {
            Call::Bid {
                level,
                strain: last_strain,
            } => {
                let min_level = if strain > *last_strain {
                    *level
                } else {
                    *level + 1
                };
                if min_level <= 7 {
                    Some(Call::Bid {
                        level: min_level,
                        strain,
                    })
                } else {
                    None
                }
            }
            _ => unreachable!("last_bid returned non-bid"),
        }
    }

    /// Returns the index of the last call made by the given position.
    pub fn last_call_index_for_position(&self, position: Position) -> Option<usize> {
        let num_calls = self.calls.len();
        let dealer_idx = self.dealer.idx();
        let target_idx = position.idx();
        let first_call_idx = (target_idx + 4 - dealer_idx) % 4;

        if num_calls <= first_call_idx {
            return None;
        }

        let k = (num_calls - first_call_idx - 1) / 4;
        Some(first_call_idx + 4 * k)
    }

    /// Returns true if a player has made any non-Pass call (bid, double, or redouble).
    pub fn player_has_acted(&self, player: Position) -> bool {
        self.iter()
            .any(|(pos, call)| pos == player && !matches!(call, Call::Pass))
    }

    /// Returns true if a partnership has made at least one bid (not pass/double/redouble).
    pub fn partnership_has_bid(&self, partnership: Partnership) -> bool {
        self.iter()
            .any(|(pos, call)| pos.partnership() == partnership && call.is_bid())
    }

    pub fn final_contract(&self) -> Option<Contract> {
        if self.is_complete() {
            self.current_contract()
        } else {
            None
        }
    }

    pub fn is_valid(&self) -> bool {
        Self::validate_calls(&self.calls)
    }

    pub fn validate_calls(calls: &[Call]) -> bool {
        let mut last_bid = None;
        let mut last_bid_index = None;
        let mut last_double_index = None;
        let mut is_redoubled = false;

        for (i, call) in calls.iter().enumerate() {
            if i > 0 && Self::is_finished_at(calls, i) {
                return false;
            }

            match call {
                Call::Pass => {}
                Call::Bid { level, strain } => {
                    if *level < 1 || *level > 7 {
                        return false;
                    }
                    if let Some(Call::Bid {
                        level: last_level,
                        strain: last_strain,
                    }) = last_bid
                    {
                        if *level < last_level || (*level == last_level && *strain <= last_strain) {
                            return false;
                        }
                    }
                    last_bid = Some(*call);
                    last_bid_index = Some(i);
                    last_double_index = None;
                    is_redoubled = false;
                }
                Call::Double => {
                    let bi = match last_bid_index {
                        Some(idx) => idx,
                        Option::None => return false,
                    };
                    if last_double_index.is_some() || is_redoubled {
                        return false;
                    }
                    if (i - bi) % 2 == 0 {
                        return false;
                    }
                    last_double_index = Some(i);
                }
                Call::Redouble => {
                    let di = match last_double_index {
                        Some(idx) => idx,
                        Option::None => return false,
                    };
                    if is_redoubled {
                        return false;
                    }
                    if (i - di) % 2 == 0 {
                        return false;
                    }
                    is_redoubled = true;
                    last_double_index = None;
                }
            }
        }
        true
    }

    /// Return all calls that would be legal as the next call in this auction.
    pub fn legal_calls(&self) -> Vec<Call> {
        if self.is_finished() {
            return Vec::new();
        }

        let mut result = Vec::new();
        result.push(Call::Pass);

        // All bids higher than the current highest bid
        for level in 1..=7u8 {
            for &strain in &Strain::ALL {
                let call = Call::Bid { level, strain };
                let mut test = self.calls.clone();
                test.push(call);
                if Self::validate_calls(&test) {
                    result.push(call);
                }
            }
        }

        // Double and Redouble
        for call in [Call::Double, Call::Redouble] {
            let mut test = self.calls.clone();
            test.push(call);
            if Self::validate_calls(&test) {
                result.push(call);
            }
        }

        result
    }

    fn is_finished_at(calls: &[Call], len: usize) -> bool {
        if len < 4 {
            return false;
        }
        let prefix = &calls[..len];
        if prefix.iter().all(|c| matches!(c, Call::Pass)) {
            return prefix.len() >= 4;
        }
        let last_three = &prefix[len - 3..];
        last_three.iter().all(|c| matches!(c, Call::Pass))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::strain::Strain;

    #[test]
    fn test_auction_finished() {
        let mut auction = Auction::new(Position::North);
        auction.bids("1S P P");
        assert!(!auction.is_finished());
        assert!(!auction.is_complete());
        auction.bid("P");
        assert!(auction.is_finished());
        assert!(auction.is_complete());
    }

    #[test]
    fn test_is_open() {
        let mut auction = Auction::new(Position::North);
        assert!(!auction.is_open());
        assert_eq!(auction.opener(), None);
        auction.bid("P");
        assert!(!auction.is_open());
        assert_eq!(auction.opener(), None);
        auction.bid("1C");
        assert!(auction.is_open());
        assert_eq!(
            auction.opener().map(|p| p.partnership()),
            Some(Partnership::EW)
        );
    }

    #[test]
    fn test_final_contract() {
        let mut auction = Auction::new(Position::North);
        auction.bid("1C");
        assert_eq!(auction.final_contract(), None);
        auction.bids("P P P");
        assert_eq!(
            auction.final_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Undoubled,
                declarer: Position::North,
            })
        );
    }

    #[test]
    fn test_current_partnership() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_partnership(), Partnership::NS);
        auction.bid("P");
        assert_eq!(auction.current_partnership(), Partnership::EW);
    }

    #[test]
    fn test_current_player() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_player(), Position::North);
        auction.bid("P");
        assert_eq!(auction.current_player(), Position::East);
    }

    #[test]
    fn test_current_contract() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_contract(), None);

        auction.bid("1C");
        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Undoubled,
                declarer: Position::North,
            })
        );

        auction.bid("X");
        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Doubled,
                declarer: Position::North,
            })
        );

        auction.bid("XX");
        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Redoubled,
                declarer: Position::North,
            })
        );

        auction.bid("1D");
        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Diamonds,
                double_status: DoubleStatus::Undoubled,
                declarer: Position::West,
            })
        );
    }

    #[test]
    fn test_declarer_logic() {
        // N: Pass, E: 1C, S: Pass, W: 2C
        // East was the first to bid Clubs for EW.
        let mut auction = Auction::bidding(Position::North, "P 1C P 2C");

        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 2,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Undoubled,
                declarer: Position::East,
            })
        );

        // N: 2D. North is first to bid Diamonds for NS.
        auction.bid("2D");
        assert_eq!(
            auction.current_contract().unwrap().declarer,
            Position::North
        );

        // E: Pass, S: 3D. North is still the first to bid Diamonds for NS.
        auction.bids("P 3D");
        assert_eq!(
            auction.current_contract().unwrap().declarer,
            Position::North
        );
    }

    #[test]
    fn test_minimum_bid_in() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(
            auction.minimum_bid_in(Strain::Clubs),
            Some(Call::Bid {
                level: 1,
                strain: Strain::Clubs
            })
        );

        auction.bid("1D");
        // Minimum bid in Clubs must be 2C because C < D
        assert_eq!(
            auction.minimum_bid_in(Strain::Clubs),
            Some(Call::Bid {
                level: 2,
                strain: Strain::Clubs
            })
        );
        // Minimum bid in Hearts is 1H because H > D
        assert_eq!(
            auction.minimum_bid_in(Strain::Hearts),
            Some(Call::Bid {
                level: 1,
                strain: Strain::Hearts
            })
        );
        // Minimum bid in Diamonds is 2D because D == D
        assert_eq!(
            auction.minimum_bid_in(Strain::Diamonds),
            Some(Call::Bid {
                level: 2,
                strain: Strain::Diamonds
            })
        );

        auction.bids("P P P");
        // Auction finished
        assert_eq!(auction.minimum_bid_in(Strain::Spades), None);
    }

    #[test]
    fn test_last_bid() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.last_bid(), None);

        // N opens 1C — last bid is (North, 1C)
        auction.bid("1C");
        let (pos, call) = auction.last_bid().unwrap();
        assert_eq!(pos, Position::North);
        assert_eq!(*call, "1C".parse::<Call>().unwrap());

        // E passes — last bid still (North, 1C)
        auction.bid("P");
        assert_eq!(auction.last_bid().unwrap().0, Position::North);

        // S bids 1S — last bid is (South, 1S)
        auction.bid("1S");
        let (pos, call) = auction.last_bid().unwrap();
        assert_eq!(pos, Position::South);
        assert_eq!(*call, "1S".parse::<Call>().unwrap());

        // W doubles — last bid still (South, 1S) (double is not a bid)
        auction.bid("X");
        assert_eq!(auction.last_bid().unwrap().0, Position::South);
    }

    #[test]
    fn test_player_has_acted() {
        // N opens 1C — North has acted, others haven't
        let auction = Auction::bidding(Position::North, "1C");
        assert!(auction.player_has_acted(Position::North));
        assert!(!auction.player_has_acted(Position::East));

        // N: 1C, E: X — East has acted (double counts)
        let auction = Auction::bidding(Position::North, "1C X");
        assert!(auction.player_has_acted(Position::East));

        // N: P, E: P — neither has acted (passes don't count)
        let auction = Auction::bidding(Position::North, "P P");
        assert!(!auction.player_has_acted(Position::North));
        assert!(!auction.player_has_acted(Position::East));
    }

    #[test]
    fn test_partnership_has_bid() {
        // N opens 1C — NS has bid, EW hasn't
        let auction = Auction::bidding(Position::North, "1C");
        assert!(auction.partnership_has_bid(Partnership::NS));
        assert!(!auction.partnership_has_bid(Partnership::EW));

        // N: 1C, E: X — EW doubled but hasn't bid
        let auction = Auction::bidding(Position::North, "1C X");
        assert!(!auction.partnership_has_bid(Partnership::EW));

        // N: 1C, E: 1S — both have bid
        let auction = Auction::bidding(Position::North, "1C 1S");
        assert!(auction.partnership_has_bid(Partnership::NS));
        assert!(auction.partnership_has_bid(Partnership::EW));
    }

    #[test]
    fn test_validate_basic() {
        let auction = Auction::bidding(Position::North, "1C P 1D P P P");
        assert!(auction.is_valid());
    }

    #[test]
    fn test_validate_invalid_bid_order() {
        let calls = vec![
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds,
            },
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
        ];
        assert!(!Auction::validate_calls(&calls));
    }

    #[test]
    fn test_validate_double() {
        let auction = Auction::bidding(Position::North, "1C X");
        assert!(auction.is_valid());

        let calls = vec![
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Pass,
            Call::Double, // Partner's bid
        ];
        assert!(!Auction::validate_calls(&calls));
    }

    #[test]
    fn test_validate_redouble() {
        let auction = Auction::bidding(Position::North, "1C X XX");
        assert!(auction.is_valid());

        let calls = vec![
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Double, // Opponent
            Call::Pass,
            Call::Redouble, // Partner's double? No, di = 1 (East). We are West (3). (3-1)%2=0. Friend.
        ];
        assert!(!Auction::validate_calls(&calls));
    }

    #[test]
    fn test_legal_calls_empty_auction() {
        let auction = Auction::new(Position::North);
        let calls = auction.legal_calls();
        // Pass + 35 bids (7 levels × 5 strains) = 36
        assert_eq!(calls.len(), 36);
        assert_eq!(calls[0], Call::Pass);
        assert_eq!(
            calls[1],
            Call::Bid {
                level: 1,
                strain: Strain::Clubs
            }
        );
    }

    #[test]
    fn test_legal_calls_after_bid() {
        let auction = Auction::bidding(Position::North, "1H");
        let calls = auction.legal_calls();
        // Pass + higher bids + Double (opponent can double)
        assert!(calls.contains(&Call::Pass));
        assert!(calls.contains(&Call::Double));
        assert!(!calls.contains(&Call::Bid {
            level: 1,
            strain: Strain::Clubs
        }));
        assert!(calls.contains(&Call::Bid {
            level: 1,
            strain: Strain::Spades
        }));
    }

    #[test]
    fn test_bid_convenience() {
        let mut auction = Auction::new(Position::North);
        auction.bid("1C");
        assert_eq!(auction.calls.len(), 1);
        assert_eq!(
            auction.calls[0],
            Call::Bid {
                level: 1,
                strain: Strain::Clubs
            }
        );

        auction.bid("P");
        assert_eq!(auction.calls[1], Call::Pass);

        auction.bid("X");
        assert_eq!(auction.calls[2], Call::Double);
    }

    #[test]
    fn test_bids_convenience() {
        let mut auction = Auction::new(Position::North);
        auction.bid("1C");
        auction.bids("P 1S P");
        assert_eq!(auction.calls.len(), 4);
        assert_eq!(
            auction.calls[2],
            Call::Bid {
                level: 1,
                strain: Strain::Spades,
            }
        );
        assert_eq!(auction.calls[3], Call::Pass);
    }

    #[test]
    #[should_panic(expected = "invalid call")]
    fn test_bid_invalid_panics() {
        let mut auction = Auction::new(Position::North);
        auction.bid("zzz");
    }

    #[test]
    fn test_bidding_convenience() {
        let auction = Auction::bidding(Position::North, "P 1C P 2C");
        assert_eq!(auction.dealer, Position::North);
        assert_eq!(auction.calls.len(), 4);
        assert_eq!(auction.calls[0], Call::Pass);
        assert_eq!(
            auction.calls[1],
            Call::Bid {
                level: 1,
                strain: Strain::Clubs
            }
        );
        assert_eq!(auction.calls[2], Call::Pass);
        assert_eq!(
            auction.calls[3],
            Call::Bid {
                level: 2,
                strain: Strain::Clubs
            }
        );
    }

    #[test]
    fn test_bidding_empty() {
        let auction = Auction::bidding(Position::South, "");
        assert_eq!(auction.dealer, Position::South);
        assert!(auction.calls.is_empty());
    }

    #[test]
    fn test_legal_calls_finished_auction() {
        let auction = Auction::bidding(Position::North, "P P P P");
        assert!(auction.legal_calls().is_empty());
    }

    #[test]
    fn test_last_call_index_for_position() {
        // Dealer is North (idx 0)
        let mut auction = Auction::new(Position::North);
        // Empty
        assert_eq!(auction.last_call_index_for_position(Position::North), None);
        assert_eq!(auction.last_call_index_for_position(Position::East), None);
        assert_eq!(auction.last_call_index_for_position(Position::South), None);
        assert_eq!(auction.last_call_index_for_position(Position::West), None);

        // N: 1C
        auction.bid("1C");
        assert_eq!(
            auction.last_call_index_for_position(Position::North),
            Some(0)
        );
        assert_eq!(auction.last_call_index_for_position(Position::East), None);

        // N: 1C, E: P, S: 1S, W: P, N: 2S
        auction.bids("P 1S P 2S");
        assert_eq!(
            auction.last_call_index_for_position(Position::North),
            Some(4)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::East),
            Some(1)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::South),
            Some(2)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::West),
            Some(3)
        );

        // Dealer is East (idx 1)
        let mut auction = Auction::new(Position::East);
        // E: 1C
        auction.bid("1C");
        assert_eq!(
            auction.last_call_index_for_position(Position::East),
            Some(0)
        );
        assert_eq!(auction.last_call_index_for_position(Position::North), None);

        // E: 1C, S: P, W: 1S, N: P, E: 2S
        auction.bids("P 1S P 2S");
        assert_eq!(
            auction.last_call_index_for_position(Position::East),
            Some(4)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::South),
            Some(1)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::West),
            Some(2)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::North),
            Some(3)
        );

        // Dealer is West (idx 3)
        let mut auction = Auction::new(Position::West);
        // W: 1C, N: P, S: P (wait, skip over South?) No, W, N, E, S.
        // W: 1C, N: 1D, E: 1H, S: 1S
        auction.bids("1C 1D 1H 1S");
        assert_eq!(
            auction.last_call_index_for_position(Position::West),
            Some(0)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::North),
            Some(1)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::East),
            Some(2)
        );
        assert_eq!(
            auction.last_call_index_for_position(Position::South),
            Some(3)
        );
    }

    #[test]
    fn test_validate_after_finish() {
        let calls = vec![
            Call::Pass,
            Call::Pass,
            Call::Pass,
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
        ];
        assert!(!Auction::validate_calls(&calls));
    }
}
