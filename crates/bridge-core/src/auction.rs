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

    pub fn add_call(&mut self, call: Call) {
        self.calls.push(call);
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
                        None => return false,
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
                        None => return false,
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
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Spades,
        });
        auction.add_call(Call::Pass);
        auction.add_call(Call::Pass);
        assert!(!auction.is_finished());
        auction.add_call(Call::Pass);
        assert!(auction.is_finished());
    }

    #[test]
    fn test_current_partnership() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_partnership(), Partnership::NS);
        auction.add_call(Call::Pass);
        assert_eq!(auction.current_partnership(), Partnership::EW);
    }

    #[test]
    fn test_current_player() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_player(), Position::North);
        auction.add_call(Call::Pass);
        assert_eq!(auction.current_player(), Position::East);
    }

    #[test]
    fn test_current_contract() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_contract(), None);

        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Undoubled,
                declarer: Position::North,
            })
        );

        auction.add_call(Call::Double);
        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Doubled,
                declarer: Position::North,
            })
        );

        auction.add_call(Call::Redouble);
        assert_eq!(
            auction.current_contract(),
            Some(Contract {
                level: 1,
                strain: Strain::Clubs,
                double_status: DoubleStatus::Redoubled,
                declarer: Position::North,
            })
        );

        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Diamonds,
        });
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
        let mut auction = Auction::new(Position::North);
        // N: Pass, E: 1C, S: Pass, W: 2C
        // East was the first to bid Clubs for EW.
        auction.add_call(Call::Pass);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Clubs,
        });
        auction.add_call(Call::Pass);
        auction.add_call(Call::Bid {
            level: 2,
            strain: Strain::Clubs,
        });

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
        auction.add_call(Call::Bid {
            level: 2,
            strain: Strain::Diamonds,
        });
        assert_eq!(
            auction.current_contract().unwrap().declarer,
            Position::North
        );

        // E: Pass, S: 3D. North is still the first to bid Diamonds for NS.
        auction.add_call(Call::Pass);
        auction.add_call(Call::Bid {
            level: 3,
            strain: Strain::Diamonds,
        });
        assert_eq!(
            auction.current_contract().unwrap().declarer,
            Position::North
        );
    }

    #[test]
    fn test_validate_basic() {
        let calls = vec![
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Pass,
            Call::Bid {
                level: 1,
                strain: Strain::Diamonds,
            },
            Call::Pass,
            Call::Pass,
            Call::Pass,
        ];
        assert!(Auction::validate_calls(&calls));
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
        let calls = vec![
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Double, // Opponent's bid
        ];
        assert!(Auction::validate_calls(&calls));

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
        let calls = vec![
            Call::Bid {
                level: 1,
                strain: Strain::Clubs,
            },
            Call::Double,   // Opponent
            Call::Redouble, // Opponent's double (friend of bidder)
        ];
        assert!(Auction::validate_calls(&calls));

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
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Bid {
            level: 1,
            strain: Strain::Hearts,
        });
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
    fn test_legal_calls_finished_auction() {
        let mut auction = Auction::new(Position::North);
        auction.add_call(Call::Pass);
        auction.add_call(Call::Pass);
        auction.add_call(Call::Pass);
        auction.add_call(Call::Pass);
        assert!(auction.legal_calls().is_empty());
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
