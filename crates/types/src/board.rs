use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum Position {
    #[default]
    North,
    East,
    South,
    West,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Partnership {
    NS,
    EW,
}

impl Partnership {
    pub fn contains(self, pos: Position) -> bool {
        match self {
            Partnership::NS => pos == Position::North || pos == Position::South,
            Partnership::EW => pos == Position::East || pos == Position::West,
        }
    }

    pub fn idx(self) -> usize {
        match self {
            Partnership::NS => 0,
            Partnership::EW => 1,
        }
    }

    pub fn opponent(self) -> Self {
        match self {
            Partnership::NS => Partnership::EW,
            Partnership::EW => Partnership::NS,
        }
    }
}

impl Position {
    pub const ALL: [Position; 4] = [
        Position::North,
        Position::East,
        Position::South,
        Position::West,
    ];

    pub fn partnership(self) -> Partnership {
        match self {
            Position::North | Position::South => Partnership::NS,
            Position::East | Position::West => Partnership::EW,
        }
    }

    pub fn next(self) -> Self {
        match self {
            Position::North => Position::East,
            Position::East => Position::South,
            Position::South => Position::West,
            Position::West => Position::North,
        }
    }

    pub fn idx(self) -> usize {
        match self {
            Position::North => 0,
            Position::East => 1,
            Position::South => 2,
            Position::West => 3,
        }
    }

    pub fn partner(self) -> Self {
        match self {
            Position::North => Position::South,
            Position::South => Position::North,
            Position::East => Position::West,
            Position::West => Position::East,
        }
    }

    /// Left-hand opponent (next in clockwise bidding order).
    pub fn lho(self) -> Self {
        self.next()
    }

    /// Right-hand opponent (previous in clockwise bidding order).
    pub fn rho(self) -> Self {
        self.partner().next()
    }

    pub fn to_char(self) -> char {
        match self {
            Position::North => 'N',
            Position::East => 'E',
            Position::South => 'S',
            Position::West => 'W',
        }
    }

    pub fn from_char(c: char) -> Option<Self> {
        match c.to_ascii_uppercase() {
            'N' => Some(Position::North),
            'E' => Some(Position::East),
            'S' => Some(Position::South),
            'W' => Some(Position::West),
            _ => None,
        }
    }

    pub fn dealer_from_board_number(board_number: u32) -> Self {
        let index = (board_number + 3) % 4;
        Position::ALL[index as usize]
    }
}

impl fmt::Display for Position {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_char())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum Vulnerability {
    #[default]
    None,
    NS,
    EW,
    Both,
}

impl Vulnerability {
    pub fn is_vulnerable(self, pos: Position) -> bool {
        match self {
            Vulnerability::None => false,
            Vulnerability::NS => pos == Position::North || pos == Position::South,
            Vulnerability::EW => pos == Position::East || pos == Position::West,
            Vulnerability::Both => true,
        }
    }

    pub fn from_board_number(board_number: u32) -> Self {
        // http://www.jazclass.aust.com/bridge/scoring/score11.htm
        match board_number % 16 {
            1 | 8 | 11 | 14 => Vulnerability::None,
            2 | 5 | 12 | 15 => Vulnerability::NS,
            3 | 6 | 9 | 0 => Vulnerability::EW,
            4 | 7 | 10 | 13 => Vulnerability::Both,
            _ => unreachable!(),
        }
    }
}

use crate::hand::Hand;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub dealer: Position,
    pub vulnerability: Vulnerability,
    pub hands: HashMap<Position, Hand>,
}

impl Board {
    pub fn new(
        dealer: Position,
        vulnerability: Vulnerability,
        hands: HashMap<Position, Hand>,
    ) -> Self {
        Self {
            dealer,
            vulnerability,
            hands,
        }
    }

    pub fn get_hand(&self, pos: Position) -> Option<&Hand> {
        self.hands.get(&pos)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_position_next() {
        assert_eq!(Position::North.next(), Position::East);
        assert_eq!(Position::West.next(), Position::North);
    }

    #[test]
    fn test_vulnerability() {
        assert!(Vulnerability::NS.is_vulnerable(Position::North));
        assert!(!Vulnerability::NS.is_vulnerable(Position::East));
        assert!(Vulnerability::Both.is_vulnerable(Position::West));
        assert!(!Vulnerability::None.is_vulnerable(Position::South));
    }

    #[test]
    fn test_position_char() {
        assert_eq!(Position::North.to_char(), 'N');
        assert_eq!(Position::from_char('W'), Some(Position::West));
        assert_eq!(Position::from_char('X'), None);
    }

    #[test]
    fn test_partnership() {
        assert_eq!(Position::North.partnership(), Partnership::NS);
        assert_eq!(Position::South.partnership(), Partnership::NS);
        assert_eq!(Position::East.partnership(), Partnership::EW);
        assert_eq!(Position::West.partnership(), Partnership::EW);

        assert!(Partnership::NS.contains(Position::North));
        assert!(Partnership::NS.contains(Position::South));
        assert!(!Partnership::NS.contains(Position::East));

        assert_eq!(Partnership::NS.idx(), 0);
        assert_eq!(Partnership::EW.idx(), 1);
    }
}
