use crate::board::{Board, Position, Vulnerability};
use crate::card::Card;
use crate::hand::Hand;
use crate::rank::Rank;
use crate::suit::Suit;
use std::collections::HashMap;

pub fn export_board(board: &Board) -> String {
    let mut s = String::new();
    s.push_str("[Event \"?\"]\n");
    s.push_str("[Site \"?\"]\n");
    s.push_str("[Date \"?\"]\n");
    s.push_str("[Board \"1\"]\n");
    s.push_str(&format!("[West \"?\"]\n"));
    s.push_str(&format!("[North \"?\"]\n"));
    s.push_str(&format!("[East \"?\"]\n"));
    s.push_str(&format!("[South \"?\"]\n"));
    s.push_str(&format!("[Dealer \"{}\"]\n", board.dealer.to_char()));
    
    let vuln_str = match board.vulnerability {
        Vulnerability::None => "None",
        Vulnerability::NS => "NS",
        Vulnerability::EW => "EW",
        Vulnerability::Both => "All",
    };
    s.push_str(&format!("[Vulnerable \"{}\"]\n", vuln_str));

    // Export hands in PBN format: "N:hand E:hand S:hand W:hand"
    let mut deal = format!("{}:", board.dealer.to_char());
    let mut current_pos = board.dealer;
    for i in 0..4 {
        if i > 0 {
            deal.push(' ');
        }
        if let Some(hand) = board.get_hand(current_pos) {
            deal.push_str(&export_hand(hand));
        } else {
            deal.push('?');
        }
        current_pos = current_pos.next();
    }
    s.push_str(&format!("[Deal \"{}\"]\n", deal));
    s.push_str("[Scoring \"?\"]\n");
    s.push_str("[Declarer \"?\"]\n");
    s.push_str("[Contract \"?\"]\n");
    s.push_str("[Result \"?\"]\n");
    
    s
}

pub fn export_hand(hand: &Hand) -> String {
    let mut sorted_hand = hand.clone();
    sorted_hand.sort();
    
    let mut s = String::new();
    for (i, suit) in Suit::ALL.iter().rev().enumerate() {
        if i > 0 {
            s.push('.');
        }
        for card in sorted_hand.cards.iter() {
            if card.suit == *suit {
                s.push(card.rank.to_char());
            }
        }
    }
    s
}

pub fn import_board(pbn: &str) -> Option<Board> {
    let mut dealer = Position::North;
    let mut vulnerability = Vulnerability::None;
    let mut hands = HashMap::new();

    for line in pbn.lines() {
        if line.starts_with("[Dealer \"") {
            let d_char = line.chars().nth(9)?;
            dealer = Position::from_char(d_char)?;
        } else if line.starts_with("[Vulnerable \"") {
            let v_str = &line[13..line.len() - 2];
            vulnerability = match v_str {
                "None" => Vulnerability::None,
                "NS" => Vulnerability::NS,
                "EW" => Vulnerability::EW,
                "All" => Vulnerability::Both,
                _ => Vulnerability::None,
            };
        } else if line.starts_with("[Deal \"") {
             let deal_str = &line[7..line.len() - 2];
             let parts: Vec<&str> = deal_str.split(':').collect();
             if parts.len() != 2 { continue; }
             let start_pos_char = parts[0].chars().next()?;
             let mut current_pos = Position::from_char(start_pos_char)?;
             
             let hands_str = parts[1].split(' ').collect::<Vec<&str>>();
             for hand_str in hands_str {
                 if hand_str != "?" {
                     hands.insert(current_pos, import_hand(hand_str)?);
                 }
                 current_pos = current_pos.next();
             }
        }
    }

    Some(Board {
        dealer,
        vulnerability,
        hands,
    })
}

pub fn import_hand(hand_str: &str) -> Option<Hand> {
    let suits: Vec<&str> = hand_str.split('.').collect();
    if suits.len() != 4 { return None; }
    
    let mut cards = Vec::new();
    let suit_sequence = [Suit::Spades, Suit::Hearts, Suit::Diamonds, Suit::Clubs];
    
    for (i, suit_str) in suits.iter().enumerate() {
        let suit = suit_sequence[i];
        for c in suit_str.chars() {
            let rank = Rank::from_char(c)?;
            cards.push(Card { suit, rank });
        }
    }
    
    Some(Hand { cards })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::board::Vulnerability;
    use crate::board::Position;

    #[test]
    fn test_pbn_roundtrip() {
        let mut hands = HashMap::new();
        hands.insert(Position::North, Hand::new(vec![Card::new(Suit::Spades, Rank::Ace)]));
        let board = Board::new(Position::North, Vulnerability::None, hands);
        
        let exported = export_board(&board);
        let imported = import_board(&exported).unwrap();
        
        assert_eq!(imported.dealer, board.dealer);
        assert_eq!(imported.vulnerability, board.vulnerability);
        assert_eq!(imported.get_hand(Position::North).unwrap().cards[0], Card::new(Suit::Spades, Rank::Ace));
    }
}
