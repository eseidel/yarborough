use crate::strain::Strain;
use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Call {
    Pass,
    Bid { level: u8, strain: Strain },
    Double,
    Redouble,
}

impl Call {
    pub fn render(self) -> String {
        match self {
            Call::Pass => "P".to_string(),
            Call::Double => "X".to_string(),
            Call::Redouble => "XX".to_string(),
            Call::Bid { level, strain } => format!("{}{}", level, strain),
        }
    }

    pub fn is_game_bid(self) -> bool {
        match self {
            Call::Bid {
                level,
                strain: Strain::NoTrump,
            } => level >= 3,
            Call::Bid {
                level,
                strain: Strain::Spades,
            } => level >= 4,
            Call::Bid {
                level,
                strain: Strain::Hearts,
            } => level >= 4,
            Call::Bid {
                level,
                strain: Strain::Diamonds,
            } => level >= 5,
            Call::Bid {
                level,
                strain: Strain::Clubs,
            } => level >= 5,
            _ => false,
        }
    }

    pub fn is_slam_bid(self) -> bool {
        match self {
            Call::Bid { level, .. } => level >= 6,
            _ => false,
        }
    }

    pub fn is_grand_slam_bid(self) -> bool {
        match self {
            Call::Bid { level, .. } => level >= 7,
            _ => false,
        }
    }

    pub fn is_major(self) -> bool {
        match self {
            Call::Bid { strain, .. } => strain.is_major(),
            _ => false,
        }
    }

    pub fn is_minor(self) -> bool {
        match self {
            Call::Bid { strain, .. } => strain.is_minor(),
            _ => false,
        }
    }
}

impl FromStr for Call {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let s = s.trim().to_ascii_uppercase();
        if s == "P" || s == "PASS" {
            return Ok(Call::Pass);
        }
        if s == "X" || s == "DBL" || s == "DOUBLE" {
            return Ok(Call::Double);
        }
        if s == "XX" || s == "RDBL" || s == "REDOUBLE" {
            return Ok(Call::Redouble);
        }
        if s.len() >= 2 {
            let level_char = s.chars().next().ok_or(())?;
            let level = level_char.to_digit(10).ok_or(())? as u8;
            if (1..=7).contains(&level) {
                let strain_char = s.chars().nth(1).ok_or(())?;
                if let Some(strain) = Strain::from_char(strain_char) {
                    return Ok(Call::Bid { level, strain });
                }
            }
        }
        Err(())
    }
}

impl fmt::Display for Call {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.render())
    }
}
