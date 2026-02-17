// cspell:ignore AKQJT AKQJ
use crate::card::Card;
use crate::rank::Rank;
use crate::suit::Suit;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Shape {
    /// No singletons, no voids, max one doubleton (4-3-3-3, 4-4-3-2, 5-3-3-2)
    Balanced,
    /// One singleton OR two doubletons, no voids (5-4-2-2, 6-3-2-2)
    SemiBalanced,
    /// Everything else (contains singletons/voids beyond SemiBalanced)
    Unbalanced,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Distribution {
    pub spades: u8,
    pub hearts: u8,
    pub diamonds: u8,
    pub clubs: u8,
}

impl Distribution {
    pub fn max() -> Self {
        Self {
            spades: 13,
            hearts: 13,
            diamonds: 13,
            clubs: 13,
        }
    }

    pub fn length(&self, suit: Suit) -> u8 {
        match suit {
            Suit::Spades => self.spades,
            Suit::Hearts => self.hearts,
            Suit::Diamonds => self.diamonds,
            Suit::Clubs => self.clubs,
        }
    }

    pub fn set_length(&mut self, suit: Suit, length: u8) {
        match suit {
            Suit::Spades => self.spades = length,
            Suit::Hearts => self.hearts = length,
            Suit::Diamonds => self.diamonds = length,
            Suit::Clubs => self.clubs = length,
        }
    }

    fn sorted_lengths(&self) -> [u8; 4] {
        let mut d = [self.spades, self.hearts, self.diamonds, self.clubs];
        d.sort_by(|a, b| b.cmp(a));
        d
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Hand {
    pub cards: Vec<Card>,
}

impl Hand {
    pub fn new(cards: Vec<Card>) -> Self {
        Self { cards }
    }

    /// Parse a hand string in the format "Clubs.Diamonds.Hearts.Spades".
    pub fn parse(s: &str) -> Self {
        crate::io::hand_parser::parse_hand(s)
    }

    pub fn hcp(&self) -> u8 {
        self.cards
            .iter()
            .map(|c| match c.rank {
                Rank::Ace => 4,
                Rank::King => 3,
                Rank::Queen => 2,
                Rank::Jack => 1,
                _ => 0,
            })
            .sum()
    }

    pub fn length(&self, suit: Suit) -> u8 {
        self.cards.iter().filter(|c| c.suit == suit).count() as u8
    }

    pub fn distribution(&self) -> Distribution {
        Distribution {
            spades: self.length(Suit::Spades),
            hearts: self.length(Suit::Hearts),
            diamonds: self.length(Suit::Diamonds),
            clubs: self.length(Suit::Clubs),
        }
    }

    pub fn sort(&mut self) {
        self.cards.sort_by(|a, b| {
            if a.suit != b.suit {
                // Reverse suit order: S, H, D, C
                let suit_val = |s: Suit| match s {
                    Suit::Spades => 3,
                    Suit::Hearts => 2,
                    Suit::Diamonds => 1,
                    Suit::Clubs => 0,
                };
                suit_val(b.suit).cmp(&suit_val(a.suit))
            } else {
                b.rank.cmp(&a.rank)
            }
        });
    }

    pub fn points(&self, trump: Option<Suit>) -> u8 {
        let hcp = self.hcp();
        if let Some(t) = trump {
            // Dummy points: HCP + shortness
            let mut shortness = 0;
            for s in Suit::ALL {
                if s == t {
                    continue;
                }
                let l = self.length(s);
                if l == 0 {
                    shortness += 5;
                } else if l == 1 {
                    shortness += 3;
                } else if l == 2 {
                    shortness += 1;
                }
            }
            hcp + shortness
        } else {
            // Length points: HCP + cards > 4
            let mut length_pts = 0;
            for s in Suit::ALL {
                let l = self.length(s);
                if l > 4 {
                    length_pts += l - 4;
                }
            }
            hcp + length_pts
        }
    }

    /// Returns the shape classification of this hand
    pub fn shape(&self) -> Shape {
        let dist = self.distribution();
        let sorted_lengths = dist.sorted_lengths();

        let longest = sorted_lengths[0];
        let doubleton_count = sorted_lengths.iter().filter(|&&l| l == 2).count();
        let singleton_count = sorted_lengths.iter().filter(|&&l| l == 1).count();
        let void_count = sorted_lengths.iter().filter(|&&l| l == 0).count();

        // Balanced: no singletons, no voids, max one doubleton
        if singleton_count == 0 && void_count == 0 && doubleton_count <= 1 {
            Shape::Balanced
        }
        // SemiBalanced: longest suit is 5-6, no voids, and either one singleton OR two doubletons
        else if longest <= 6 && void_count == 0 && (singleton_count == 1 || doubleton_count == 2)
        {
            Shape::SemiBalanced
        }
        // Everything else
        else {
            Shape::Unbalanced
        }
    }

    /// Returns true if the hand is balanced (4-3-3-3, 4-4-3-2, 5-3-3-2)
    pub fn is_balanced(&self) -> bool {
        matches!(self.shape(), Shape::Balanced)
    }

    /// Returns true if the hand is semi-balanced (5-4-2-2, 6-3-2-2, etc.)
    pub fn is_semi_balanced(&self) -> bool {
        matches!(self.shape(), Shape::SemiBalanced)
    }

    /// Returns the longest suit in the hand
    pub fn longest_suit(&self) -> Suit {
        let mut max_len = 0;
        let mut longest = Suit::Spades;

        for suit in Suit::ALL {
            let len = self.length(suit);
            if len > max_len {
                max_len = len;
                longest = suit;
            }
        }

        longest
    }

    /// Count how many of the top N honors (A, K, Q, J, T) the hand holds in a suit.
    ///
    /// `top_honors(suit, 3)` counts honors among {A, K, Q}.
    /// `top_honors(suit, 5)` counts honors among {A, K, Q, J, T}.
    pub fn top_honors(&self, suit: Suit, n: u8) -> u8 {
        const HONOR_RANKS: [Rank; 5] = [Rank::Ace, Rank::King, Rank::Queen, Rank::Jack, Rank::Ten];
        let top_n = &HONOR_RANKS[..n as usize];
        self.cards
            .iter()
            .filter(|c| c.suit == suit && top_n.contains(&c.rank))
            .count() as u8
    }

    /// Returns all suits that are tied for the longest length
    pub fn longest_suits(&self) -> Vec<Suit> {
        let lengths: Vec<_> = Suit::ALL.iter().map(|&s| self.length(s)).collect();
        let max_len = *lengths.iter().max().unwrap_or(&0);

        Suit::ALL
            .iter()
            .enumerate()
            .filter(|(i, _)| lengths[*i] == max_len)
            .map(|(_, &suit)| suit)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hcp_calculation() {
        let hand = Hand::parse("J.Q.K.A2");
        assert_eq!(hand.hcp(), 10);
    }

    #[test]
    fn test_distribution() {
        let hand = Hand::parse("..Q.AK");
        let dist = hand.distribution();
        assert_eq!(dist.spades, 2);
        assert_eq!(dist.hearts, 1);
        assert_eq!(dist.diamonds, 0);
        assert_eq!(dist.clubs, 0);
    }

    #[test]
    fn test_hand_sorting() {
        let mut hand = Hand::parse("A...2");
        hand.sort();
        assert_eq!(hand.cards[0].suit, Suit::Spades);
        assert_eq!(hand.cards[1].suit, Suit::Clubs);
    }

    #[test]
    fn test_balanced_4333() {
        // 4-3-3-3 distribution
        let hand = Hand::parse("AKQ.AKQ.AKQ.AKQJ");
        assert_eq!(hand.shape(), Shape::Balanced);
        assert!(hand.is_balanced());
        assert!(!hand.is_semi_balanced());
    }

    #[test]
    fn test_balanced_4432() {
        // 4-4-3-2 distribution
        let hand = Hand::parse("AK.AKQ.AKQJ.AKQJ");
        assert_eq!(hand.shape(), Shape::Balanced);
        assert!(hand.is_balanced());
    }

    #[test]
    fn test_balanced_5332() {
        // 5-3-3-2 distribution
        let hand = Hand::parse("AK.AKQ.AKQ.AKQJT");
        assert_eq!(hand.shape(), Shape::Balanced);
        assert!(hand.is_balanced());
    }

    #[test]
    fn test_semi_balanced_5422() {
        // 5-4-2-2 distribution (two doubletons)
        let hand = Hand::parse("AK.AK.AKQJ.AKQJT");
        assert_eq!(hand.shape(), Shape::SemiBalanced);
        assert!(hand.is_semi_balanced());
        assert!(!hand.is_balanced());
    }

    #[test]
    fn test_semi_balanced_6322() {
        // 6-3-2-2 distribution (two doubletons)
        let hand = Hand::parse("AK.AK.AKQ.AKQJT9");
        assert_eq!(hand.shape(), Shape::SemiBalanced);
        assert!(hand.is_semi_balanced());
    }

    #[test]
    fn test_semi_balanced_5431() {
        // 5-4-3-1 distribution (one singleton)
        let hand = Hand::parse("A.AKQ.AKQJ.AKQJT");
        assert_eq!(hand.shape(), Shape::SemiBalanced);
        assert!(hand.is_semi_balanced());
    }

    #[test]
    fn test_unbalanced_5440() {
        // 5-4-4-0 distribution (void)
        let hand = Hand::parse(".AKQJ.AKQJ.AKQJT");
        assert_eq!(hand.shape(), Shape::Unbalanced);
        assert!(!hand.is_balanced());
        assert!(!hand.is_semi_balanced());
    }

    #[test]
    fn test_unbalanced_7321() {
        // 7-3-2-1 distribution
        let hand = Hand::parse("A.AK.AKQ.AKQJT98");
        assert_eq!(hand.shape(), Shape::Unbalanced);
    }

    #[test]
    fn test_longest_suit() {
        let hand = Hand::parse(".A.AK.AKQJT");
        assert_eq!(hand.longest_suit(), Suit::Spades);
    }

    #[test]
    fn test_longest_suits_single() {
        let hand = Hand::parse(".A.AK.AKQJT");
        let longest = hand.longest_suits();
        assert_eq!(longest.len(), 1);
        assert_eq!(longest[0], Suit::Spades);
    }

    #[test]
    fn test_top_honors_two_of_top_three() {
        // AQ753 spades — has A and Q of top 3
        let hand = Hand::parse("..AQ753.");
        assert_eq!(hand.top_honors(Suit::Hearts, 3), 2);
    }

    #[test]
    fn test_top_honors_three_of_top_five() {
        // KJT42 spades — has K, J, T of top 5 but only K of top 3
        let hand = Hand::parse("..KJT42.");
        assert_eq!(hand.top_honors(Suit::Hearts, 3), 1);
        assert_eq!(hand.top_honors(Suit::Hearts, 5), 3);
    }

    #[test]
    fn test_top_honors_poor_suit() {
        // K8432 clubs — only K
        let hand = Hand::parse("K8432...");
        assert_eq!(hand.top_honors(Suit::Clubs, 3), 1);
        assert_eq!(hand.top_honors(Suit::Clubs, 5), 1);
    }

    #[test]
    fn test_top_honors_empty_suit() {
        let hand = Hand::parse("AKQJT...");
        assert_eq!(hand.top_honors(Suit::Spades, 5), 0);
    }

    #[test]
    fn test_top_honors_all_five() {
        let hand = Hand::parse("AKQJT...");
        assert_eq!(hand.top_honors(Suit::Clubs, 5), 5);
        assert_eq!(hand.top_honors(Suit::Clubs, 3), 3);
    }

    #[test]
    fn test_longest_suits_tied() {
        // 5-5-2-1 distribution
        let hand = Hand::parse("A.AK.AKQJT.AKQJT");
        let longest = hand.longest_suits();
        assert_eq!(longest.len(), 2);
        assert!(longest.contains(&Suit::Spades));
        assert!(longest.contains(&Suit::Hearts));
    }
}
