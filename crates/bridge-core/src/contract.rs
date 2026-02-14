use crate::board::{Partnership, Position};
use crate::strain::Strain;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub enum DoubleStatus {
    #[default]
    Undoubled,
    Doubled,
    Redoubled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Contract {
    pub level: u8,
    pub strain: Strain,
    pub double_status: DoubleStatus,
    pub declarer: Position,
}

impl Contract {
    pub fn partnership(&self) -> Partnership {
        self.declarer.partnership()
    }

    pub fn belongs_to(&self, partnership: Partnership) -> bool {
        self.partnership() == partnership
    }

    pub fn is_game(&self) -> bool {
        match self.strain {
            Strain::NoTrump => self.level >= 3,
            Strain::Hearts | Strain::Spades => self.level >= 4,
            Strain::Clubs | Strain::Diamonds => self.level >= 5,
        }
    }

    pub fn is_slam(&self) -> bool {
        self.level >= 6
    }

    pub fn is_grand_slam(&self) -> bool {
        self.level == 7
    }
}
