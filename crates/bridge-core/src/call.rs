use crate::strain::Strain;
use serde::{Deserialize, Serialize};
use std::fmt;

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

    pub fn from_str(s: &str) -> Option<Self> {
        let s = s.trim().to_ascii_uppercase();
        if s == "P" || s == "PASS" {
            return Some(Call::Pass);
        }
        if s == "X" || s == "DBL" || s == "DOUBLE" {
            return Some(Call::Double);
        }
        if s == "XX" || s == "RDBL" || s == "REDOUBLE" {
            return Some(Call::Redouble);
        }
        if s.len() >= 2 {
            let level_char = s.chars().next()?;
            let level = level_char.to_digit(10)? as u8;
            if (1..=7).contains(&level) {
                let strain_char = s.chars().nth(1)?;
                if let Some(strain) = Strain::from_char(strain_char) {
                    return Some(Call::Bid { level, strain });
                }
            }
        }
        None
    }
}

impl fmt::Display for Call {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.render())
    }
}
