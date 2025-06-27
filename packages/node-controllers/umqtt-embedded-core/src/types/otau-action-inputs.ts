//TODO: Derive tese types automatically from a WoT document (TM or TD).

export type WriteActionInput = {
  path: string;
  payload: {
    data: string;
    hash: string;
    algo: "crc32";
  };
  append?: boolean;
};

export type DeleteActionInput = {
  path: string;
  recursive?: boolean; // If path is a directory, delete all contents recursively
};

// TODO: integrate these new input types.
export type InitActionInput = {
  tmUrl: string; // URL for the new Thing Model
};

export type FinishActionInput = {
  commit: boolean; // If true, commit the changes
};
