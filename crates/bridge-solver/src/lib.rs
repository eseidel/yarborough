use bridge_core::board::Position;
use bridge_core::Board;
use dds_bridge::deal::{Deal, Seat, Suit, SmallSet};
use dds_bridge::solver::{self, StrainFlags};
use dds_bridge::contract::Strain as DdsStrain;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DoubleDummySolution {
    pub north: Vec<u32>, // indexed by Strain: Clubs, Diamonds, Hearts, Spades, Notrump
    pub south: Vec<u32>,
    pub east: Vec<u32>,
    pub west: Vec<u32>,
}

pub fn solve(board: &Board) -> DoubleDummySolution {
    let mut deal = Deal::default();
    
    for (pos_core, seat_dds) in [
        (Position::North, Seat::North),
        (Position::South, Seat::South),
        (Position::East, Seat::East),
        (Position::West, Seat::West),
    ] {
        if let Some(hand_core) = board.get_hand(pos_core) {
            for card in &hand_core.cards {
                let suit_dds = match card.suit {
                    bridge_core::Suit::Clubs => Suit::Clubs,
                    bridge_core::Suit::Diamonds => Suit::Diamonds,
                    bridge_core::Suit::Hearts => Suit::Hearts,
                    bridge_core::Suit::Spades => Suit::Spades,
                };
                let rank_val = match card.rank {
                    bridge_core::Rank::Two => 2,
                    bridge_core::Rank::Three => 3,
                    bridge_core::Rank::Four => 4,
                    bridge_core::Rank::Five => 5,
                    bridge_core::Rank::Six => 6,
                    bridge_core::Rank::Seven => 7,
                    bridge_core::Rank::Eight => 8,
                    bridge_core::Rank::Nine => 9,
                    bridge_core::Rank::Ten => 10,
                    bridge_core::Rank::Jack => 11,
                    bridge_core::Rank::Queen => 12,
                    bridge_core::Rank::King => 13,
                    bridge_core::Rank::Ace => 14,
                };
                deal[seat_dds][suit_dds].insert(rank_val);
            }
        }
    }

    let results = solver::solve_deals(&[deal], StrainFlags::all()).expect("Double dummy solver failed");
    let table = results[0];

    let get_tricks = |seat: Seat| {
        vec![
            u32::from(table[DdsStrain::Clubs].get(seat)),
            u32::from(table[DdsStrain::Diamonds].get(seat)),
            u32::from(table[DdsStrain::Hearts].get(seat)),
            u32::from(table[DdsStrain::Spades].get(seat)),
            u32::from(table[DdsStrain::Notrump].get(seat)),
        ]
    };

    DoubleDummySolution {
        north: get_tricks(Seat::North),
        south: get_tricks(Seat::South),
        east: get_tricks(Seat::East),
        west: get_tricks(Seat::West),
    }
}
