use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Suit {
    Clubs,
    Diamonds,
    Hearts,
    Spades,
}

impl Suit {
    pub const ALL: [Suit; 4] = [Suit::Clubs, Suit::Diamonds, Suit::Hearts, Suit::Spades];

    pub fn to_char(self) -> char {
        match self {
            Suit::Clubs => 'C',
            Suit::Diamonds => 'D',
            Suit::Hearts => 'H',
            Suit::Spades => 'S',
        }
    }

    pub fn from_char(c: char) -> Option<Self> {
        match c.to_ascii_uppercase() {
            'C' => Some(Suit::Clubs),
            'D' => Some(Suit::Diamonds),
            'H' => Some(Suit::Hearts),
            'S' => Some(Suit::Spades),
            _ => None,
        }
    }

    pub fn symbol(self) -> &'static str {
        match self {
            Suit::Clubs => "♣️",
            Suit::Diamonds => "♦️",
            Suit::Hearts => "❤️",
            Suit::Spades => "♠️",
        }
    }

    pub fn is_major(self) -> bool {
        matches!(self, Suit::Hearts | Suit::Spades)
    }

    pub fn is_minor(self) -> bool {
        matches!(self, Suit::Clubs | Suit::Diamonds)
    }
}

impl fmt::Display for Suit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_char())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_suit_parsing() {
        assert_eq!(Suit::from_char('S'), Some(Suit::Spades));
        assert_eq!(Suit::from_char('h'), Some(Suit::Hearts));
        assert_eq!(Suit::from_char('D'), Some(Suit::Diamonds));
        assert_eq!(Suit::from_char('c'), Some(Suit::Clubs));
        assert_eq!(Suit::from_char('X'), None);
    }

    #[test]
    fn test_suit_display() {
        assert_eq!(Suit::Spades.to_string(), "S");
    }
}
