// cspell:ignore SAHDC
use crate::auction::Auction;
use crate::board::{Board, Position, Vulnerability};
use crate::call::Call;
use crate::card::Card;
use crate::hand::Hand;
use crate::rank::Rank;
use crate::strain::Strain;
use crate::suit::Suit;
use std::collections::HashMap;

pub fn export_board(board: &Board, auction: Option<&Auction>) -> String {
    let mut parts = Vec::new();

    // md (deal)
    // LIN uses 1=N, 2=E, 3=S, 4=W
    // Format: md|3S...H...D...C...,...|
    // The number after md| is the dealer (1-4).
    let dealer_idx = match board.dealer {
        Position::North => 1,
        Position::East => 2,
        Position::South => 3,
        Position::West => 4,
    };

    let mut md = format!("md|{}", dealer_idx);
    let mut current_pos = Position::South; // LIN often starts with South? No, actually it can start anywhere but let's be careful.
                                           // The convention is often md|dealer_idx_plus_offset...
                                           // Let's use the first hand as South by convention if possible.
                                           // Actually, LIN md format is usually md|dealer_idxHand1,Hand2,Hand3| where Hand4 is inferred.

    for i in 0..3 {
        if i > 0 {
            md.push(',');
        }
        if let Some(hand) = board.get_hand(current_pos) {
            md.push_str(&export_hand(hand));
        }
        current_pos = current_pos.next();
    }
    md.push('|');
    parts.push(md);

    // sv (vulnerability) : o (none), n (ns), e (ew), b (both)
    let sv = match board.vulnerability {
        Vulnerability::None => "o",
        Vulnerability::NS => "n",
        Vulnerability::EW => "e",
        Vulnerability::Both => "b",
    };
    parts.push(format!("sv|{}|", sv));

    // mb (bids)
    if let Some(a) = auction {
        for call in &a.calls {
            parts.push(format!("mb|{}|", export_call(*call)));
        }
    }

    parts.join("")
}

fn export_hand(hand: &Hand) -> String {
    let mut s = String::new();
    for suit in [Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs] {
        s.push(suit.to_char());
        for card in &hand.cards {
            if card.suit == suit {
                s.push(card.rank.to_char());
            }
        }
    }
    s
}

fn export_call(call: Call) -> String {
    match call {
        Call::Pass => "p".to_string(),
        Call::Double => "d".to_string(),
        Call::Redouble => "r".to_string(),
        Call::Bid { level, strain } => {
            let s = match strain {
                Strain::Clubs => "C",
                Strain::Diamonds => "D",
                Strain::Hearts => "H",
                Strain::Spades => "S",
                Strain::NoTrump => "N",
            };
            format!("{}{}", level, s)
        }
    }
}

pub fn import_board(lin: &str) -> Option<(Board, Option<Auction>)> {
    // Basic LIN parser
    let parts: Vec<&str> = lin.split('|').collect();
    let mut dealer = Position::South;
    let mut vulnerability = Vulnerability::None;
    let mut hands = HashMap::new();
    let mut calls = Vec::new();

    let mut i = 0;
    while i < parts.len() {
        match parts[i] {
            "md" if i + 1 < parts.len() => {
                let md_val = parts[i + 1];
                let (d_char, hands_str) = md_val.split_at(1);
                let d_idx = d_char.parse::<u8>().ok()?;
                dealer = match d_idx {
                    1 => Position::North,
                    2 => Position::East,
                    3 => Position::South,
                    4 => Position::West,
                    _ => Position::South,
                };

                let h_parts: Vec<&str> = hands_str.split(',').collect();
                let mut current_pos = Position::South;
                for h_str in h_parts {
                    if let Some(hand) = import_hand(h_str) {
                        hands.insert(current_pos, hand);
                    }
                    current_pos = current_pos.next();
                }
                // Handle the 4th hand if it's there (sometimes only 3 are provided)
                // If only 3 are provided, we'd need to calculate the 4th.
                // For now let's assume all or 3 are provided.
                i += 1;
            }
            "sv" if i + 1 < parts.len() => {
                vulnerability = match parts[i + 1] {
                    "o" => Vulnerability::None,
                    "n" => Vulnerability::NS,
                    "e" => Vulnerability::EW,
                    "b" => Vulnerability::Both,
                    _ => Vulnerability::None,
                };
                i += 1;
            }
            "mb" if i + 1 < parts.len() => {
                if let Some(call) = import_call(parts[i + 1]) {
                    calls.push(call);
                }
                i += 1;
            }
            _ => {}
        }
        i += 1;
    }

    let board = Board {
        dealer,
        vulnerability,
        hands,
    };

    let auction = if !calls.is_empty() {
        Some(Auction { dealer, calls })
    } else {
        None
    };

    Some((board, auction))
}

fn import_hand(s: &str) -> Option<Hand> {
    let mut cards = Vec::new();
    let mut current_suit = Suit::Spades;

    let chars = s.chars();
    for c in chars {
        if let Some(suit) = Suit::from_char(c) {
            current_suit = suit;
        } else if let Some(rank) = Rank::from_char(c) {
            cards.push(Card {
                suit: current_suit,
                rank,
            });
        }
    }
    Some(Hand { cards })
}

fn import_call(s: &str) -> Option<Call> {
    match s.to_lowercase().as_str() {
        "p" => Some(Call::Pass),
        "d" => Some(Call::Double),
        "r" => Some(Call::Redouble),
        _ if s.len() >= 2 => {
            let level = s[0..1].parse::<u8>().ok()?;
            let suit_char = s.chars().nth(1)?;
            let strain = Strain::from_char(suit_char)?;
            Some(Call::Bid { level, strain })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lin_hand_export() {
        let hand = Hand::new(vec![Card::new(Suit::Spades, Rank::Ace)]);
        assert_eq!(export_hand(&hand), "SAHDC");
    }

    #[test]
    fn test_lin_call_import() {
        assert_eq!(
            import_call("1S"),
            Some(Call::Bid {
                level: 1,
                strain: Strain::Spades
            })
        );
        assert_eq!(
            import_call("1N"),
            Some(Call::Bid {
                level: 1,
                strain: Strain::NoTrump
            })
        );
        assert_eq!(import_call("p"), Some(Call::Pass));
    }
}
