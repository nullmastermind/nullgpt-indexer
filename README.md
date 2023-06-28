##### A section of the repository https://github.com/nullmastermind/chatgpt-web is dedicated to providing you with a method to communicate using confidential documentation.

```shell
# Require node version >= v18.16.1

corepack enable
yarn install
yarn build
yarn start
```

To create an index, create a folder inside the `docs` folder and call the API. Please import `nullgpt_indexer.json` to https://hoppscotch.io/ to see some API examples. Just run and go to https://gpt.dongnv.dev to chat with your private documentation.

Don't forget to create a `.env` file with example content from the `.env.example` file and add the value for `OPENAI_API_KEY`.

### Note:

- `doc_id` is the same as the folder name inside `docs`
- You have the option to create an alias file to index other directories that exist on your disk.

For example, create a file called `docs/sample_documents/1.alias` with the following content:

```
D:\documents\sample_documents1
E:\documents\sample_documents2
G:\documents\sample_documents3
G:\documents\document.txt
```

Next, you can call the index API using the `doc_id` as `sample_documents`.