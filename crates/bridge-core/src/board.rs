use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Position {
    North,
    East,
    South,
    West,
}

impl Position {
    pub const ALL: [Position; 4] = [
        Position::North,
        Position::East,
        Position::South,
        Position::West,
    ];

    pub fn next(self) -> Self {
        match self {
            Position::North => Position::East,
            Position::East => Position::South,
            Position::South => Position::West,
            Position::West => Position::North,
        }
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
}

impl fmt::Display for Position {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_char())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Vulnerability {
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
    pub fn new(dealer: Position, vulnerability: Vulnerability, hands: HashMap<Position, Hand>) -> Self {
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
    }
}
