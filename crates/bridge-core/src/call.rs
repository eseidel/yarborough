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
    pub fn to_string(self) -> String {
        match self {
            Call::Pass => "P".to_string(),
            Call::Double => "X".to_string(),
            Call::Redouble => "XX".to_string(),
            Call::Bid { level, strain } => format!("{}{}", level, strain),
        }
    }
}

impl fmt::Display for Call {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.to_string())
    }
}
