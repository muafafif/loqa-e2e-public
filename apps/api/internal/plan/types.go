package plan

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

// AppScope controls which app(s) a plan/license grants access to.
type AppScope string

const (
	AppScopePersonal AppScope = "personal"
	AppScopeBusiness AppScope = "business"
	AppScopeBoth     AppScope = "both"
)

// StringArray persists a []string as a JSONB column (e.g. Plan.Modules,
// Subscription.Modules) without pulling in an extra dependency for it.
type StringArray []string

func (a StringArray) Value() (driver.Value, error) {
	if a == nil {
		return "[]", nil
	}
	b, err := json.Marshal([]string(a))
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

func (a *StringArray) Scan(value interface{}) error {
	if value == nil {
		*a = StringArray{}
		return nil
	}
	var raw []byte
	switch v := value.(type) {
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		return errors.New("plan.StringArray: unsupported Scan source type")
	}
	if len(raw) == 0 {
		*a = StringArray{}
		return nil
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return err
	}
	*a = StringArray(out)
	return nil
}

// GormDataType tells GORM's AutoMigrate to use the jsonb column type for
// fields of this type instead of guessing from the Go kind (which would
// otherwise produce a plain text column).
func (StringArray) GormDataType() string {
	return "jsonb"
}

func (a StringArray) Contains(key string) bool {
	for _, m := range a {
		if m == key {
			return true
		}
	}
	return false
}
