const getErrorMessage = (error, fallbackMessage) => {
  if (error.response && error.response.data) {
    if (typeof error.response.data === "string") {
      return error.response.data;
    }

    if (error.response.data.message) {
      return error.response.data.message;
    }

    if (error.response.data.error) {
      return error.response.data.error;
    }
  }

  return fallbackMessage;
};

module.exports = {
  getErrorMessage,
};
