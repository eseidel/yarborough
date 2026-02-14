use crate::suit::Suit;
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub enum Strain {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
    NoTrump,
}

impl Strain {
    pub const ALL: [Strain; 5] = [
        Strain::Clubs,
        Strain::Diamonds,
        Strain::Hearts,
        Strain::Spades,
        Strain::NoTrump,
    ];

    pub fn idx(self) -> usize {
        match self {
            Strain::Clubs => 0,
            Strain::Diamonds => 1,
            Strain::Hearts => 2,
            Strain::Spades => 3,
            Strain::NoTrump => 4,
        }
    }

    pub fn to_char(self) -> char {
        match self {
            Strain::Clubs => 'C',
            Strain::Diamonds => 'D',
            Strain::Hearts => 'H',
            Strain::Spades => 'S',
            Strain::NoTrump => 'N',
        }
    }

    pub fn from_char(c: char) -> Option<Self> {
        match c.to_ascii_uppercase() {
            'C' => Some(Strain::Clubs),
            'D' => Some(Strain::Diamonds),
            'H' => Some(Strain::Hearts),
            'S' => Some(Strain::Spades),
            'N' => Some(Strain::NoTrump),
            _ => None,
        }
    }

    pub fn from_suit(suit: Suit) -> Self {
        match suit {
            Suit::Clubs => Strain::Clubs,
            Suit::Diamonds => Strain::Diamonds,
            Suit::Hearts => Strain::Hearts,
            Suit::Spades => Strain::Spades,
        }
    }

    pub fn to_suit(self) -> Option<Suit> {
        match self {
            Strain::Clubs => Some(Suit::Clubs),
            Strain::Diamonds => Some(Suit::Diamonds),
            Strain::Hearts => Some(Suit::Hearts),
            Strain::Spades => Some(Suit::Spades),
            Strain::NoTrump => None,
        }
    }

    pub fn is_major(self) -> bool {
        matches!(self, Strain::Hearts | Strain::Spades)
    }

    pub fn is_minor(self) -> bool {
        matches!(self, Strain::Clubs | Strain::Diamonds)
    }
}

impl fmt::Display for Strain {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_char())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strain_parsing() {
        assert_eq!(Strain::from_char('S'), Some(Strain::Spades));
        assert_eq!(Strain::from_char('N'), Some(Strain::NoTrump));
    }
}
