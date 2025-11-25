import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Notes } from "../target/types/notes";
import {PublicKey} from "@solana/web3.js";
import {assert}  from "chai"
describe("notes", () => {
  // Configure the client to use the local cluster.

  const provider=anchor.AnchorProvider.env();
  anchor.setProvider(anchor.AnchorProvider.env());
  
  async function airdrop(provider: anchor.AnchorProvider, pubkey: PublicKey, amountSol = 2) {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    amountSol * anchor.web3.LAMPORTS_PER_SOL
   );
   await provider.connection.confirmTransaction(sig);
 }



  const program = anchor.workspace.notes as Program<Notes>;
  const author  = provider.wallet.publicKey;   
  
  const title = "delhi-weather";
  const content =Buffer.from( "This is my first note");

  let notePda: PublicKey;
  let noteBump: number;

  it("Derives PDA", async () => {
    [notePda, noteBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("note"),
        author.toBuffer(),
      ],
      program.programId
    );

    assert.ok(notePda);
  });

  it("Creates a note", async () => {
    await program.methods
      .createNote(title, content)
      .accounts({
        note: notePda,
        author,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const note = await program.account.note.fetch(notePda);
    assert.equal(note.title, title);
    assert.equal(note.content.toString("utf8"),content);
    assert.equal(note.author.toBase58(), author.toBase58());
  });
  
   it("Updates a note", async () => {
    const newContent =Buffer.from("Updated note content");

    await program.methods
      .updateNote(newContent)
      .accounts({
        note: notePda,
        author,
      })
      .rpc();

    const note = await program.account.note.fetch(notePda);
    assert.equal(note.content.toString("utf-8"),newContent);

  });

  it("Deletes a note", async () => {
    await program.methods
      .deleteNote()
      .accounts({
        note: notePda,
        author,
      })
     .rpc();

    const noteAcc = await provider.connection.getAccountInfo(notePda);
    assert.equal(noteAcc, null);
  });
  
  it("Fails to create note when title too long", async () => {
  const longTitle =Buffer.from("a".repeat(101));       
  const [pda] =  PublicKey.findProgramAddressSync(
    [
      Buffer.from("note"),
      author.toBuffer(),
    ],
    program.programId
  );

  try {
    await program.methods
      .createNote(longTitle,Buffer.from("ok"))        
      .accounts({
        note: pda,
        author,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    assert.fail("Should fail: title too long");
  } catch (err) {
     assert.include(err.toString(), "TitleTooLong");
  }
});
 

  it("Fails to create note when content too long", async () => {
  const title = "valid";
  const longContent = Buffer.from("a".repeat(1001));

  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("note"),
      author.toBuffer(),
    ],
    program.programId
  );


  try {
    await program.methods
      .createNote(title,longContent) 
      .accounts({
        note: pda,
        author,
        systemProgram:anchor.web3.SystemProgram.programId,
      })
      .rpc();

    assert.fail("Should fail: content too long");
  } catch (err) {
    assert.include(err.toString(), "Range");
  }
});

   it("Fails to create a note with empty title", async () => {
    const [badPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("note"), author.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .createNote("",Buffer.from("content"))
        .accounts({
          note: badPda,
          author,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should fail: empty title");
    } catch (err) {
      assert.include(err.toString(), "TitleEmpty");
    }
  });

  it("Fails to create a note with empty content", async () => {
    const [badPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("note"), author.toBuffer()],
      program.programId
    );

    try {
      await program.methods
        .createNote("title",Buffer.from(""))
        .accounts({
          note: badPda,
          author,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should fail: empty content");
    } catch (err) {
        assert.include(err.toString(),"ContentEmpty")
    }
  });
    
   it("Fails to update note by unauthorized user", async () => {
   const realAuthor = anchor.web3.Keypair.generate();
   const attacker = anchor.web3.Keypair.generate();

  await airdrop(provider, realAuthor.publicKey);
  await airdrop(provider, attacker.publicKey);
  const [notePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("note"),
      realAuthor.publicKey.toBuffer(),
    ],
    program.programId
  );

  await program.methods
    .createNote("hello", Buffer.from("world"))
    .accounts({
      note: notePda,
      author: realAuthor.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([realAuthor])
    .rpc();

  const maliciousContent = Buffer.from("HACK ATTEMPT!");

  try {
    await program.methods
      .updateNote(maliciousContent)
      .accounts({
        note: notePda,
        author: attacker.publicKey, 
      })
      .signers([attacker])
      .rpc();

    assert.fail("Unauthorized update should fail");
  } catch (err) {
      assert.include(err.toString(),"Unauthorized")
 
  }
});
  
 
});
