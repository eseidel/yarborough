use crate::board::Position;
use crate::call::Call;
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

    pub fn add_call(&mut self, call: Call) {
        self.calls.push(call);
    }

    pub fn current_player(&self) -> Position {
        let mut p = self.dealer;
        for _ in 0..self.calls.len() {
            p = p.next();
        }
        p
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
                        if *level < last_level
                            || (*level == last_level && *strain <= last_strain)
                        {
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
    fn test_current_player() {
        let mut auction = Auction::new(Position::North);
        assert_eq!(auction.current_player(), Position::North);
        auction.add_call(Call::Pass);
        assert_eq!(auction.current_player(), Position::East);
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
            Call::Double, // Opponent
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
