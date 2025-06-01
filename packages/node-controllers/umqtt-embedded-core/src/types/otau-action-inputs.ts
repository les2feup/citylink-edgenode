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
